import type { Api } from 'grammy';

// Как бот выглядит в Telegram: имя, описания и меню команд. Бот сам приводит себя к этим текстам
// при запуске — в @BotFather их вводить не нужно. Аватарку, картинку описания и «главное
// мини-приложение» Bot API менять не умеет — они настраиваются в @BotFather вручную.

export const BOT_NAME = 'Куда идём?';

/** В профиле бота и в превью ссылки на него. До 120 символов. */
export const BOT_SHORT_DESCRIPTION =
  'Соберите друзей и выберите, куда пойти в Севастополе: каждый ответит на 4 вопроса, а бот подберёт места для всех.';

/** В пустом чате с ботом, над кнопкой «Начать». До 512 символов. */
export const BOT_DESCRIPTION = [
  'Помогаю компании быстро решить, куда пойти в Севастополе.',
  '',
  '1. Выберите день и время и отправьте приглашение в чат друзей.',
  '2. Каждый отвечает на 4 коротких вопроса: бюджет, настроение, район.',
  '3. Я подбираю 5 мест, которые подойдут всем, — вы голосуете.',
  '4. Итог приходит каждому в личку: место, время и маршрут.',
].join('\n');

/** Ответ на /help — то же, что описание, плюс как начать. */
export const HELP_TEXT = `${BOT_DESCRIPTION}\n\nЧтобы начать, нажмите «Собрать вылазку» или кнопку «Куда идём?» слева от поля ввода.`;

export const BOT_COMMANDS = [
  { command: 'start', description: 'Собрать вылазку' },
  { command: 'help', description: 'Как это работает' },
];

/**
 * Обновляет только то, что отличается: Telegram строго ограничивает частоту смены имени,
 * поэтому сначала читаем текущее значение. Ошибка здесь не мешает работе бота.
 */
export async function syncBotProfile(api: Api): Promise<string[]> {
  const changed: string[] = [];
  await Promise.all([
    api.getMyName().then(async ({ name }) => {
      if (name !== BOT_NAME) await api.setMyName(BOT_NAME).then(() => changed.push('имя'));
    }),
    api.getMyShortDescription().then(async ({ short_description }) => {
      if (short_description !== BOT_SHORT_DESCRIPTION) {
        await api.setMyShortDescription(BOT_SHORT_DESCRIPTION).then(() => changed.push('короткое описание'));
      }
    }),
    api.getMyDescription().then(async ({ description }) => {
      if (description !== BOT_DESCRIPTION) await api.setMyDescription(BOT_DESCRIPTION).then(() => changed.push('описание'));
    }),
    api.getMyCommands().then(async (current) => {
      const same =
        current.length === BOT_COMMANDS.length &&
        current.every((c, i) => c.command === BOT_COMMANDS[i]!.command && c.description === BOT_COMMANDS[i]!.description);
      if (!same) await api.setMyCommands(BOT_COMMANDS).then(() => changed.push('команды'));
    }),
  ]);
  return changed;
}
