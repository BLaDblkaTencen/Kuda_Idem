import { Hono } from 'hono';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { places, type Place } from '../db/schema.js';
import { DISTRICTS, FEATURES, type District, type Feature } from '../domain/constants.js';
import { yandexMapsLink } from '../domain/format.js';
import { placeGoTo, placeKind, placeTitle } from '../domain/place-name.js';
import { placeIcon, placeTags } from '../domain/place-badges.js';

/**
 * Карточка места для интерфейса: всё уже с русскими подписями.
 * startsAt — время встречи: по нему считаются метки (часы работы в этот день). Без него меток нет.
 */
export function placeCard(p: Place, startsAt?: Date) {
  return {
    id: p.id,
    name: p.name,
    title: placeTitle(p), // «Кинотеатр «Победа»»
    goTo: placeGoTo(p), // «в кинотеатр «Победа»», «на Приморский бульвар» — после «Идём»
    kind: placeKind(p),
    icon: placeIcon(p), // 🎬, 🌳, 💨 — значок вида места
    tags: startsAt ? placeTags(p, startsAt) : [], // «бесплатно», «18+», «🕑 до 23:00»…
    type: p.type,
    district: p.district,
    districtLabel: DISTRICTS[p.district as District] ?? p.district,
    address: p.address,
    avgCheck: p.avgCheck,
    isFree: p.avgCheck === 0,
    features: p.features.map((f) => FEATURES[f as Feature] ?? f),
    description: p.description,
    photos: p.photos,
    mapsUrl: yandexMapsLink(p),
    isTestData: p.isTestData,
  };
}

// Каталог мест (P1: просмотр без вылазки). Сейчас — для проверки данных.
export const placeRoutes = new Hono().get('/', async (c) => {
  const rows = await db
    .select()
    .from(places)
    .where(and(eq(places.city, 'sevastopol'), eq(places.isActive, true)))
    .orderBy(asc(places.name));
  return c.json(rows.map((p) => placeCard(p)));
});
