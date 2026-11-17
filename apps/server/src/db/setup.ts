import { and, count, eq, getTableColumns, isNotNull, notInArray, sql } from 'drizzle-orm';
import { db } from './client.js';
import { places } from './schema.js';
import { PLACES } from './places.generated.js';
import { TEST_PLACES } from './seed-places.js';

/**
 * Приводит места в базе к таблице data/places-sevastopol.csv (через places.generated.ts):
 * новые добавляет, изменённые обновляет (по id из 2ГИС), убранные из таблицы — скрывает.
 * Тестовые места скрываются, если keepTestPlaces=false. Ничего не удаляется: на места ссылаются вылазки.
 */
export async function syncPlaces({ keepTestPlaces }: { keepTestPlaces: boolean }): Promise<number> {
  if (PLACES.length > 0) {
    const columns = getTableColumns(places);
    const updatable = Object.keys(columns).filter((k) => k !== 'id') as Array<keyof typeof columns>;
    await db
      .insert(places)
      .values(PLACES)
      .onConflictDoUpdate({
        target: places.externalId,
        set: Object.fromEntries(updatable.map((k) => [k, sql.raw(`excluded."${columns[k].name}"`)])),
      });
  }

  const ids = PLACES.map((p) => p.externalId!).filter(Boolean);
  // Реальные места, которых больше нет в таблице.
  await db
    .update(places)
    .set({ isActive: false })
    .where(
      and(
        eq(places.isTestData, false),
        isNotNull(places.externalId),
        ids.length ? notInArray(places.externalId, ids) : undefined,
      ),
    );
  await db.update(places).set({ isActive: keepTestPlaces }).where(eq(places.isTestData, true));
  return PLACES.length;
}

/** Загружает тестовые места, если их ещё нет в базе (для разработки). Возвращает число добавленных. */
export async function seedTestPlacesIfMissing(): Promise<number> {
  const [row] = await db.select({ n: count() }).from(places).where(eq(places.isTestData, true));
  if ((row?.n ?? 0) > 0) return 0;
  await db.insert(places).values(TEST_PLACES.map((p) => ({ ...p, isTestData: true })));
  return TEST_PLACES.length;
}

