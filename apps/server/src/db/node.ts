// Подключение к базе для Node.js (локальная разработка, Docker).
//   pglite:./.data/pglite          — встроенный PostgreSQL (WASM) прямо в процессе, без Docker.
//                                    Открыть базу может только один процесс сразу.
//   postgres://user:pass@host/db   — обычный PostgreSQL (Docker, Neon, сервер).

import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import * as schema from './schema.js';
import { setDb, db, type Db } from './client.js';

// Корень репозитория: src/db (или dist/db) → apps/server → корень.
export const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
export const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

export let usingPglite = false;

export async function connectNodeDb(): Promise<void> {
  const url = process.env.DATABASE_URL ?? '';
  usingPglite = url.startsWith('pglite:');

  if (usingPglite) {
    const { PGlite } = await import('@electric-sql/pglite');
    const { drizzle } = await import('drizzle-orm/pglite');
    const dataDir = resolve(repoRoot, url.slice('pglite:'.length));
    mkdirSync(dataDir, { recursive: true });
    const client = new PGlite(dataDir);
    setDb(drizzle(client, { schema }) as unknown as Db, () => client.close());
    return;
  }

  // DATABASE_SSL=no-verify — шифрованное соединение без проверки сертификата (для баз хостинга
  // с собственным сертификатом). Тогда в самом DATABASE_URL не должно быть параметра sslmode.
  const ssl = process.env.DATABASE_SSL === 'no-verify' ? { rejectUnauthorized: false } : undefined;
  const pool = new pg.Pool({ connectionString: url, ssl });
  setDb(drizzlePg(pool, { schema }), () => pool.end());
}

/** Применяет недостающие миграции из apps/server/drizzle. Безопасно вызывать при каждом запуске. */
export async function runNodeMigrations(): Promise<void> {
  if (usingPglite) {
    const { migrate } = await import('drizzle-orm/pglite/migrator');
    await migrate(db as never, { migrationsFolder });
  } else {
    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    await migrate(db, { migrationsFolder });
  }
}
