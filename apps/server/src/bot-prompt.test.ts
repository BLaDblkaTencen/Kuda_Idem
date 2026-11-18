import { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sendPrompt } from './bot.js';
import { db, setDb, type Db } from './db/client.js';
import { migrationsFolder } from './db/node.js';
import * as schema from './db/schema.js';

// Сообщения с кнопкой «Собрать вылазку»: в личке остаётся только последнее.
// База — PGlite в памяти, Telegram — заглушка, которая запоминает удаления.

let client: PGlite;
beforeAll(async () => {
  client = new PGlite();
  const d = drizzle(client, { schema });
  await migrate(d, { migrationsFolder });
  setDb(d as unknown as Db, () => client.close());
});
afterAll(() => client.close());

function fakeApi(failDelete = false) {
  const deleted: number[] = [];
  return {
    deleted,
    api: {
      deleteMessage: async (_chat: number, id: number) => {
        if (failDelete) throw new Error('message can not be deleted'); // старше 48 часов
        deleted.push(id);
        return true;
      },
    },
  };
}
let nextId = 100;
const send = () => Promise.resolve({ message_id: ++nextId });

describe('sendPrompt', () => {
  it('первое сообщение ничего не удаляет, следующее удаляет предыдущее', async () => {
    const { api, deleted } = fakeApi();
    await sendPrompt(api as never, { id: 1, firstName: 'Маша' }, send); // 101 — новый пользователь из /start
    expect(deleted).toEqual([]);
    await sendPrompt(api as never, { id: 1 }, send); // 102 — после итога вылазки
    expect(deleted).toEqual([101]);
    await sendPrompt(api as never, { id: 1, firstName: 'Маша' }, send); // 103
    expect(deleted).toEqual([101, 102]);
    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, 1));
    expect(row!.lastPromptMessageId).toBe(103);
    expect(row!.firstName).toBe('Маша');
  });

  it('если старое удалить нельзя (старше 48 часов) — без ошибки, новое запоминается', async () => {
    await sendPrompt(fakeApi().api as never, { id: 2, firstName: 'Петя' }, send);
    const { api } = fakeApi(true);
    await expect(sendPrompt(api as never, { id: 2 }, send)).resolves.toBeUndefined();
    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, 2));
    expect(row!.lastPromptMessageId).toBe(nextId);
  });
});
