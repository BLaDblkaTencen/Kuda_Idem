import { db } from './db/client.js';
import { events } from './db/schema.js';

// Названия событий — из раздела «Метрики успеха» спецификации.
export type EventName =
  | 'trip_created'
  | 'trip_opened'
  | 'answer_submitted'
  | 'suggestions_generated'
  | 'more_options_requested'
  | 'vote_cast'
  | 'place_chosen'
  | 'route_opened';

/** Пишет событие в базу. Ошибка аналитики никогда не ломает основной запрос. */
export async function track(
  name: EventName,
  ctx: { userId?: number; tripId?: string; props?: Record<string, unknown> } = {},
): Promise<void> {
  try {
    await db.insert(events).values({
      name,
      userId: ctx.userId ?? null,
      tripId: ctx.tripId ?? null,
      props: ctx.props ?? {},
    });
  } catch (err) {
    console.warn('Не удалось записать событие', name, err);
  }
}
