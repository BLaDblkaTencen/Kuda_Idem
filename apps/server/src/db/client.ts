import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { drizzle as drizzlePg, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema.js';

// Две базы на выбор через DATABASE_URL:
//   pglite:./.data/pglite          — встроенный PostgreSQL (WASM) прямо в процессе, без Docker.
//                                    Удобно для разработки. Открыть базу может только один процесс сразу.
//   postgres://user:pass@host/db   — обычный PostgreSQL (Docker, сервер в production).

const url = process.env.DATABASE_URL ?? '';
export const usingPglite = url.startsWith('pglite:');

// Корень репозитория: src/db (или dist/db) → apps/server → корень.
const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
export const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

let db: NodePgDatabase<typeof schema>;
let closeDb: () => Promise<void>;

if (usingPglite) {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const { mkdirSync } = await import('node:fs');
  const dataDir = resolve(repoRoot, url.slice('pglite:'.length));
  mkdirSync(dataDir, { recursive: true });
  const client = new PGlite(dataDir);
  // API запросов у обоих драйверов одинаковый, поэтому используем общий тип.
  db = drizzle(client, { schema }) as unknown as NodePgDatabase<typeof schema>;
  closeDb = () => client.close();
} else {
  const pool = new pg.Pool({ connectionString: url });
  db = drizzlePg(pool, { schema });
  closeDb = () => pool.end();
}

export { db, closeDb };
export type Db = typeof db;
