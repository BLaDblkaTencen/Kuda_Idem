import { Bot, InlineKeyboard } from 'grammy';
import type { InlineQueryResultArticle } from 'grammy/types';
import { config } from './config.js';

// Бот: кнопка запуска Mini App и подготовка сообщений, которыми Mini App делится в чат
// (Bot API savePreparedInlineMessage + Telegram.WebApp.shareMessage на фронтенде).

export const bot = config.botEnabled ? new Bot(config.BOT_TOKEN) : null;

let botUsername: string | null = null;

/** Ссылка, которая открывает Mini App сразу на нужной вылазке. */
export function tripLink(tripId: string): string | null {
  if (!botUsername) return null;
  return config.MINI_APP_SHORT_NAME
    ? `https://t.me/${botUsername}/${config.MINI_APP_SHORT_NAME}?startapp=${tripId}`
    : `https://t.me/${botUsername}?startapp=${tripId}`;
}

export async function startBot(): Promise<void> {
  if (!bot) {
    console.log('BOT_TOKEN не задан — бот выключен, API работает без него');
    return;
  }

  bot.command('start', async (ctx) => {
    if (!config.WEB_APP_URL) {
      await ctx.reply('Приложение ещё не подключено: задайте WEB_APP_URL в .env.');
      return;
    }
    await ctx.reply('Соберите друзей и за пару минут выберите, куда пойти.', {
      reply_markup: new InlineKeyboard().webApp('Собрать вылазку', config.WEB_APP_URL),
    });
  });

  bot.catch((err) => console.error('Ошибка бота:', err.error));

  const me = await bot.api.getMe();
  botUsername = me.username;
  // Long polling удобен для разработки; для production позже переключимся на webhook.
  void bot.start({ drop_pending_updates: true });
  console.log(`Бот @${botUsername} запущен`);
}

export async function stopBot(): Promise<void> {
  await bot?.stop();
}

/**
 * Готовит сообщение, которое пользователь отправит в выбранный чат из Mini App.
 * Возвращает id для Telegram.WebApp.shareMessage(id) или null, если бот выключен.
 */
export async function prepareShareMessage(
  userId: number,
  opts: { title: string; text: string; buttons: Array<{ text: string; url: string }> },
): Promise<string | null> {
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
