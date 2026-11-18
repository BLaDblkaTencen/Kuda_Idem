import { createHmac } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { Bot, GrammyError, InlineKeyboard, webhookCallback, type Api } from 'grammy';
import type { InlineQueryResultArticle } from 'grammy/types';
import { config } from './config.js';
import { HELP_TEXT, PROFILE_VERSION, syncBotProfile } from './bot-profile.js';
import { getAppState, setAppState } from './db/setup.js';
import { db } from './db/client.js';
import { users } from './db/schema.js';

// Бот работает в одном из двух режимов (BOT_MODE):
//   polling — процесс сам опрашивает Telegram. Для разработки на компьютере (npm run dev / telegram).
//   webhook — Telegram присылает обновления на /api/telegram/webhook. Для Cloudflare Workers.
// Плюс подготовка сообщений, которыми Mini App делится в чат
// (Bot API savePreparedInlineMessage + Telegram.WebApp.shareMessage на фронтенде).

export const WEBHOOK_PATH = '/api/telegram/webhook';

let botInstance: Bot | null = null;
let initPromise: Promise<void> | null = null;

/** Бот создаётся при первом обращении — когда настройки уже доступны. */
function getBot(): Bot | null {
  if (!config.botEnabled) return null;
  if (!botInstance) {
    botInstance = new Bot(config.BOT_TOKEN);
    registerHandlers(botInstance);
  }
  return botInstance;
}

/** Бот с загруженными данными о себе (username нужен для ссылок). Один запрос getMe на запуск. */
async function readyBot(): Promise<Bot | null> {
  const bot = getBot();
  if (!bot) return null;
  initPromise ??= bot.init().catch((err) => {
    initPromise = null;
    throw err;
  });
  await initPromise;
  return bot;
}

function registerHandlers(bot: Bot): void {
  bot.command('start', async (ctx) => {
    if (!config.WEB_APP_URL) {
      await ctx.reply('Приложение ещё не подключено: задайте WEB_APP_URL.');
      return;
    }
    // /start <id вылазки> — открыть сразу нужную вылазку.
    const tripId = /^[\w-]{1,32}$/.test(ctx.match) ? ctx.match : '';
    const url = tripId ? `${config.WEB_APP_URL}#/trip/${tripId}` : config.WEB_APP_URL;
    const send = () =>
      ctx.reply(
        tripId ? 'Вас позвали на вылазку — ответьте на 4 вопроса.' : 'Соберите друзей и за пару минут выберите, куда пойти.',
        { reply_markup: new InlineKeyboard().webApp(tripId ? 'Открыть вылазку' : 'Собрать вылазку', url) },
      );
    if (ctx.chat.type === 'private' && ctx.from) await sendPrompt(ctx.api, { id: ctx.from.id, firstName: ctx.from.first_name }, send);
    else await send();
  });
  bot.command('help', async (ctx) => {
    const keyboard = config.WEB_APP_URL ? new InlineKeyboard().webApp('Собрать вылазку', config.WEB_APP_URL) : undefined;
    const send = () => ctx.reply(HELP_TEXT, { reply_markup: keyboard });
    if (keyboard && ctx.chat.type === 'private' && ctx.from) {
      await sendPrompt(ctx.api, { id: ctx.from.id, firstName: ctx.from.first_name }, send);
    } else await send();
  });
  bot.catch((err) => console.error('Ошибка бота:', err.error));
}

/**
 * Сообщение с кнопкой «Собрать вылазку» в личном чате: в чате остаётся только последнее такое.
 * Сначала отправляем новое (чтобы кнопка не пропадала), потом удаляем предыдущее.
 * Telegram даёт боту удалять свои сообщения только в первые 48 часов — более старые остаются.
 */
export async function sendPrompt(
  api: Api,
  user: { id: number; firstName?: string },
  send: () => Promise<{ message_id: number }>,
): Promise<void> {
  const [row] = await db.select({ last: users.lastPromptMessageId }).from(users).where(eq(users.id, user.id));
  const sent = await send();
  if (user.firstName) {
    // /start может прислать тот, кто ещё не открывал приложение, — тогда его ещё нет в базе.
    await db
      .insert(users)
      .values({ id: user.id, firstName: user.firstName, lastPromptMessageId: sent.message_id })
      .onConflictDoUpdate({ target: users.id, set: { lastPromptMessageId: sent.message_id } });
  } else {
    await db.update(users).set({ lastPromptMessageId: sent.message_id }).where(eq(users.id, user.id));
  }
  if (row?.last && row.last !== sent.message_id) {
    await api.deleteMessage(user.id, row.last).catch(() => {}); // старше 48 часов или уже удалено вручную
  }
}

/** Имя, описания и команды бота — по текстам из bot-profile.ts. Ошибка не ломает запуск. */
async function applyProfile(bot: Bot): Promise<void> {
  try {
    // Тексты не менялись с прошлого раза для этого бота — 4 запроса к Telegram не нужны.
    const key = `bot_profile:${bot.botInfo.id}`;
    if ((await getAppState(key)) === PROFILE_VERSION) return;
    const changed = await syncBotProfile(bot.api);
    if (changed.length) console.log(`Профиль бота обновлён: ${changed.join(', ')}`);
    await setAppState(key, PROFILE_VERSION);
  } catch (err) {
    console.error('Не удалось обновить профиль бота:', err);
  }
}

/** Кнопка «Куда идём?» слева от поля ввода в чате с ботом — на текущий адрес приложения. */
async function updateMenuButton(bot: Bot): Promise<void> {
  if (!config.WEB_APP_URL.startsWith('https://')) return;
  await bot.api.setChatMenuButton({
    menu_button: { type: 'web_app', text: 'Куда идём?', web_app: { url: config.WEB_APP_URL } },
  });
}

/** Ссылка, которая открывает Mini App сразу на нужной вылазке. */
export async function tripLink(tripId: string): Promise<string | null> {
  const bot = await readyBot().catch(() => null);
  if (!bot) return null;
  const username = bot.botInfo.username;
  return config.MINI_APP_SHORT_NAME
    ? `https://t.me/${username}/${config.MINI_APP_SHORT_NAME}?startapp=${tripId}`
    : `https://t.me/${username}?startapp=${tripId}`;
}

// ---------- режим webhook (Cloudflare) ----------

/** Секрет вебхука выводится из токена: отдельная настройка не нужна, а подделать запрос без токена нельзя. */
function webhookSecret(): string {
  return createHmac('sha256', 'kuda-idem-webhook').update(config.BOT_TOKEN).digest('hex');
}

/** Обработка обновления от Telegram. Проверяет секрет в заголовке X-Telegram-Bot-Api-Secret-Token. */
export async function handleWebhook(request: Request): Promise<Response> {
  const bot = config.BOT_MODE === 'webhook' ? await readyBot() : null;
  if (!bot) return new Response('Not found', { status: 404 });
  return webhookCallback(bot, 'std/http', { secretToken: webhookSecret() })(request);
}

let webhookChecked: Promise<void> | null = null;

/**
 * Подключает вебхук к адресу этого приложения, если он ещё не подключён (или подключён к старому адресу).
 * Вызывается при запуске экземпляра Worker'а: ручная настройка в Telegram не нужна.
 */
export function ensureWebhook(origin: string): Promise<void> {
  webhookChecked ??= (async () => {
    const bot = await readyBot();
    if (!bot || config.BOT_MODE !== 'webhook') return;
    const url = `${origin}${WEBHOOK_PATH}`;
    const info = await bot.api.getWebhookInfo();
    if (info.url !== url) {
      await bot.api.setWebhook(url, { secret_token: webhookSecret(), allowed_updates: ['message'] });
      await updateMenuButton(bot);
      console.log(`Вебхук бота подключён: ${url}`);
    }
    await applyProfile(bot);
  })().catch((err) => {
    webhookChecked = null;
    throw err;
  });
  return webhookChecked;
}

// ---------- режим polling (компьютер разработчика) ----------

let stopping = false;
const RESTART_DELAY_MS = 10_000;

export async function startPolling(): Promise<void> {
  const bot = await readyBot();
  if (!bot) {
    console.log('BOT_TOKEN не задан — бот выключен, API работает без него');
    return;
  }

  // Если у бота подключён вебхук — значит, он уже работает на Cloudflare. Опрос отключил бы вебхук
  // и «украл» боевого бота, поэтому для разработки нужен отдельный бот со своим токеном.
  const info = await bot.api.getWebhookInfo();
  if (info.url) {
    console.error(
      `Этот бот подключён к ${info.url} (опубликованная версия). Локально он не запускается, чтобы не ` +
        'сломать её. Для разработки создайте отдельного бота в @BotFather и укажите его токен в .env.',
    );
    return;
  }

  await updateMenuButton(bot);
  await applyProfile(bot);
  pollWithRestarts(bot);
  console.log(`Бот @${bot.botInfo.username} запущен (опрос)`);
}

/**
 * Опрос с автоперезапуском. Ошибка 409 значит, что этого же бота опрашивает другой процесс.
 * Без перехвата такая ошибка уронила бы весь сервер.
 */
function pollWithRestarts(bot: Bot): void {
  bot.start({ drop_pending_updates: true }).catch((err: unknown) => {
    if (stopping) return;
    const conflict = err instanceof GrammyError && err.error_code === 409;
    console.error(
      conflict
        ? 'Этого бота уже опрашивает другой процесс (409) — повторю через 10 с. Остановите лишний запуск.'
        : 'Опрос бота прервался с ошибкой — повторю через 10 с:',
      conflict ? '' : err,
    );
    setTimeout(() => pollWithRestarts(bot), RESTART_DELAY_MS);
  });
}

export async function stopBot(): Promise<void> {
  stopping = true;
  if (botInstance?.isRunning()) await botInstance.stop();
}

// ---------- Личные сообщения от бота ----------

/**
 * Отправляет сообщение каждому пользователю в личный чат с ботом.
 * Бот может писать только тем, кто разрешил (запустил бота или дал доступ из Mini App) —
 * остальным Telegram отвечает ошибкой 403, такие отправки просто пропускаются.
 */
export type BotMessage = {
  html: string;
  // true — сообщение с кнопкой «Собрать вылазку»: предыдущее такое удаляется (см. sendPrompt).
  prompt?: boolean;
  // url — обычная ссылка; webApp — открыть Mini App (работает только в личном чате с ботом).
  buttons: Array<{ text: string; url: string } | { text: string; webApp: string }>;
};

/** Каждому пользователю — сообщения по порядку. Если первое не дошло, остальные ему не шлются. */
export async function sendToUsers(userIds: number[], messages: BotMessage[]): Promise<{ sent: number; failed: number }> {
  const bot = await readyBot().catch(() => null);
  if (!bot) return { sent: 0, failed: userIds.length };
  const prepared = messages.map((m) => {
    const keyboard = new InlineKeyboard();
    for (const b of m.buttons) ('url' in b ? keyboard.url(b.text, b.url) : keyboard.webApp(b.text, b.webApp)).row();
    return { html: m.html, keyboard, prompt: m.prompt };
  });
  const results = await Promise.allSettled(
    userIds.map(async (id) => {
      for (const m of prepared) {
        const send = () =>
          bot.api.sendMessage(id, m.html, {
            parse_mode: 'HTML',
            link_preview_options: { is_disabled: true },
            reply_markup: m.keyboard,
          });
        if (m.prompt) await sendPrompt(bot.api, { id }, send);
        else await send();
      }
    }),
  );
  const failed = results.filter((r) => r.status === 'rejected');
  for (const r of failed) {
    const err = (r as PromiseRejectedResult).reason;
    if (!(err instanceof GrammyError && err.error_code === 403)) console.error('Не удалось отправить сообщение:', err);
  }
  return { sent: results.length - failed.length, failed: failed.length };
}

// ---------- «Поделиться в чат» ----------

/**
 * Готовит сообщение, которое пользователь отправит в выбранный чат из Mini App.
 * Возвращает id для Telegram.WebApp.shareMessage(id) или null, если бот выключен.
 */
export async function prepareShareMessage(
  userId: number,
  opts: { title: string; text: string; buttons: Array<{ text: string; url: string }> },
): Promise<string | null> {
  const bot = await readyBot();
  if (!bot) return null;
  const keyboard = new InlineKeyboard();
  for (const b of opts.buttons) keyboard.url(b.text, b.url).row();

  const result: InlineQueryResultArticle = {
    type: 'article',
    id: `${Date.now()}`,
    title: opts.title,
    input_message_content: { message_text: opts.text },
    reply_markup: keyboard,
  };
  const prepared = await bot.api.savePreparedInlineMessage(userId, result, {
    allow_user_chats: true,
    allow_group_chats: true,
  });
  return prepared.id;
}
