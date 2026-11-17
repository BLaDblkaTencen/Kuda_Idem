import type { FastifyInstance } from 'fastify';
import { asc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { places, type Place } from '../db/schema.js';
import { DISTRICTS, FEATURES, PLACE_TYPES, type District, type Feature, type PlaceType } from '../domain/constants.js';
import { yandexMapsLink } from '../domain/format.js';

/** Карточка места для интерфейса: всё уже с русскими подписями. */
export function placeCard(p: Place) {
  return {
    id: p.id,
    name: p.name,
    type: p.type,
    typeLabel: PLACE_TYPES[p.type as PlaceType] ?? p.type,
    district: p.district,
    districtLabel: DISTRICTS[p.district as District] ?? p.district,
    address: p.address,
    avgCheck: p.avgCheck,
    isFree: p.avgCheck === 0,
    vibes: p.vibes,
    features: p.features.map((f) => FEATURES[f as Feature] ?? f),
    noOrderOk: p.noOrderOk,
    description: p.description,
    photos: p.photos,
    mapsUrl: yandexMapsLink(p),
    isTestData: p.isTestData,
  };
}

export async function placeRoutes(app: FastifyInstance): Promise<void> {
  // Каталог мест (P1: просмотр без вылазки). Сейчас — для проверки данных.
  app.get('/api/places', async () => {
    const rows = await db.select().from(places).where(eq(places.city, 'sevastopol')).orderBy(asc(places.name));
    return rows.map(placeCard);
  });
}
