import { createHmac } from 'node:crypto';
import { Bot, GrammyError, InlineKeyboard, webhookCallback } from 'grammy';
import type { InlineQueryResultArticle } from 'grammy/types';
import { config } from './config.js';

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
    await ctx.reply(
      tripId ? 'Вас позвали на вылазку — ответьте на 4 вопроса.' : 'Соберите друзей и за пару минут выберите, куда пойти.',
      { reply_markup: new InlineKeyboard().webApp(tripId ? 'Открыть вылазку' : 'Собрать вылазку', url) },
    );
  });
  bot.catch((err) => console.error('Ошибка бота:', err.error));
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
