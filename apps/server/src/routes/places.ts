import { Hono } from 'hono';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { places, type Place } from '../db/schema.js';
import { DISTRICTS, FEATURES, PLACE_TYPES, type District, type Feature, type PlaceType } from '../domain/constants.js';
import { yandexMapsLink } from '../domain/format.js';
import { placeKind, placeTitle } from '../domain/place-name.js';
import { placeIcon } from '../domain/place-badges.js';

/** Карточка места для интерфейса: всё уже с русскими подписями. */
export function placeCard(p: Place) {
  return {
    id: p.id,
    name: p.name,
    title: placeTitle(p), // «Кинотеатр «Победа»»
    kind: placeKind(p),
    icon: placeIcon(p), // 🎬, 🌳, 💨 — значок вида места
    type: p.type,
    typeLabel: PLACE_TYPES[p.type as PlaceType] ?? p.type,
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
  return c.json(rows.map(placeCard));
});
