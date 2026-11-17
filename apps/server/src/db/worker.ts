// Подключение к базе для Cloudflare Workers: Neon по HTTP (каждый запрос — отдельный fetch,
// без постоянного соединения, что и нужно в Workers).

import { neon, type NeonQueryFunction } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema.js';
import { setDb, type Db } from './client.js';
import { MIGRATIONS } from './migrations.generated.js';

export function connectWorkerDb(url: string): NeonQueryFunction<false, false> {
  const sql = neon(url);
  setDb(drizzle(sql, { schema }) as unknown as Db);
  return sql;
}

/**
 * Применяет встроенные миграции, которых ещё нет в базе. Каждая миграция — одна транзакция,
 * первым шагом которой пишется её метка: если два экземпляра Worker'а стартуют одновременно,
 * второй упрётся в уже записанную метку, и миграция не применится дважды.
 */
export async function runEmbeddedMigrations(sql: NeonQueryFunction<false, false>): Promise<number> {
  await sql.query(
    'create table if not exists kuda_migrations (tag text primary key, applied_at timestamptz not null default now())',
  );
  const rows = (await sql.query('select tag from kuda_migrations')) as Array<{ tag: string }>;
  const applied = new Set(rows.map((r) => r.tag));
  let count = 0;
  for (const m of MIGRATIONS) {
    if (applied.has(m.tag)) continue;
    await sql.transaction([
      sql.query('insert into kuda_migrations (tag) values ($1)', [m.tag]),
      ...m.statements.map((s) => sql.query(s)),
    ]);
    count++;
  }
  return count;
}
