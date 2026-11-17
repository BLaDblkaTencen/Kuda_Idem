import { count } from 'drizzle-orm';
import { db, migrationsFolder, usingPglite } from './client.js';
import { places } from './schema.js';
import { TEST_PLACES } from './seed-places.js';

/** Применяет недостающие миграции. Безопасно вызывать при каждом запуске. */
export async function runMigrations(): Promise<void> {
  if (usingPglite) {
    const { migrate } = await import('drizzle-orm/pglite/migrator');
    await migrate(db as never, { migrationsFolder });
  } else {
    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    await migrate(db, { migrationsFolder });
  }
}

/** Загружает тестовые места, только если мест в базе ещё нет совсем. Возвращает число добавленных. */
export async function seedTestPlacesIfEmpty(): Promise<number> {
  const [row] = await db.select({ n: count() }).from(places);
  if ((row?.n ?? 0) > 0) return 0;
  await db.insert(places).values(TEST_PLACES.map((p) => ({ ...p, isTestData: true })));
  return TEST_PLACES.length;
}
