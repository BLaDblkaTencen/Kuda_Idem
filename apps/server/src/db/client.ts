import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from './schema.js';

// Единая точка доступа к базе для всего кода. Конкретное подключение выбирает точка входа:
//   Node.js (index.ts)   → db/node.ts:   встроенный PGlite или обычный PostgreSQL;
//   Cloudflare (worker.ts) → db/worker.ts: Neon по HTTP.
// API запросов у всех драйверов Drizzle одинаковый, поэтому тип общий.

export type Db = NodePgDatabase<typeof schema>;

let current: Db | null = null;
let closer: () => Promise<void> = async () => {};

export function setDb(db: Db, close: () => Promise<void> = async () => {}): void {
  current = db;
  closer = close;
}

/** Обращение `db.select(...)` идёт к подключению, которое выбрала точка входа. */
export const db = new Proxy({} as Db, {
  get(_target, key) {
    if (!current) throw new Error('База не подключена: точка входа должна вызвать setDb()');
    const value = Reflect.get(current, key, current);
    return typeof value === 'function' ? value.bind(current) : value;
  },
});

export function closeDb(): Promise<void> {
  return closer();
}
