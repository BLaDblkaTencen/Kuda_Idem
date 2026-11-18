import { describe, expect, it } from 'vitest';
import { BOT_COMMANDS, BOT_DESCRIPTION, BOT_NAME, BOT_SHORT_DESCRIPTION } from './bot-profile.js';

// Лимиты Telegram Bot API: иначе setMy* вернёт ошибку при запуске бота.
describe('профиль бота укладывается в лимиты Telegram', () => {
  it('длина текстов', () => {
    expect(BOT_NAME.length).toBeLessThanOrEqual(64);
    expect(BOT_SHORT_DESCRIPTION.length).toBeLessThanOrEqual(120);
    expect(BOT_DESCRIPTION.length).toBeLessThanOrEqual(512);
  });
  it('команды', () => {
    for (const c of BOT_COMMANDS) {
      expect(c.command).toMatch(/^[a-z0-9_]{1,32}$/);
      expect(c.description.length).toBeGreaterThanOrEqual(1);
      expect(c.description.length).toBeLessThanOrEqual(256);
    }
  });
});

describe('syncBotProfile', () => {
  it('меняет только то, что отличается', async () => {
    const { syncBotProfile } = await import('./bot-profile.js');
    const calls: string[] = [];
    const api = {
      getMyName: async () => ({ name: BOT_NAME }), // уже совпадает — имя не трогаем
      getMyShortDescription: async () => ({ short_description: 'старое' }),
      getMyDescription: async () => ({ description: '' }),
      getMyCommands: async () => BOT_COMMANDS,
      setMyName: async () => calls.push('name'),
      setMyShortDescription: async () => calls.push('short'),
      setMyDescription: async () => calls.push('description'),
      setMyCommands: async () => calls.push('commands'),
    };
    const changed = await syncBotProfile(api as never);
    expect(calls.sort()).toEqual(['description', 'short']);
    expect(changed.sort()).toEqual(['короткое описание', 'описание']);
  });
});
