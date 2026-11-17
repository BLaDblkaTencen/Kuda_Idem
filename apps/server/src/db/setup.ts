import { count } from 'drizzle-orm';
import { db } from './client.js';
import { places } from './schema.js';
import { TEST_PLACES } from './seed-places.js';

/** Загружает тестовые места, только если мест в базе ещё нет совсем. Возвращает число добавленных. */
export async function seedTestPlacesIfEmpty(): Promise<number> {
  const [row] = await db.select({ n: count() }).from(places);
  if ((row?.n ?? 0) > 0) return 0;
  await db.insert(places).values(TEST_PLACES.map((p) => ({ ...p, isTestData: true })));
  return TEST_PLACES.length;
}
