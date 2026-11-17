import { Hono, type Context } from 'hono';
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { db } from '../db/client.js';
import { places, trips, tripAnswers, tripSuggestions, users, votes, type Place, type Trip } from '../db/schema.js';
import {
  BUDGET_OPTIONS,
  CONSTRAINT_KEYS,
  DISTRICT_KEYS,
  MOOD_KEYS,
  type Constraint,
  type District,
  type Mood,
} from '../domain/constants.js';
import { formatTripDate, yandexMapsLink } from '../domain/format.js';
import { matchPlaces } from '../matching/match.js';
import { requireUser } from '../http/auth.js';
import { fail, INVALID_JSON, readJson, type AppEnv } from '../http/types.js';
import { track } from '../analytics.js';
import { prepareShareMessage, sendToUsers, tripLink, type BotMessage } from '../bot.js';
import { config } from '../config.js';
import { resultCardText, websiteUrl } from '../domain/result-card.js';
import { placeCard } from './places.js';

const MAX_DAYS_AHEAD = 30;

const createTripBody = z.object({ startsAt: z.iso.datetime({ offset: true }) });

const answerBody = z.object({
  budget: z
    .number()
    .int()
    .refine((b) => (BUDGET_OPTIONS as readonly number[]).includes(b), 'Недопустимый бюджет')
    .nullable(),
  moods: z.array(z.enum(MOOD_KEYS as [Mood, ...Mood[]])).max(MOOD_KEYS.length),
  district: z.enum(DISTRICT_KEYS as [District, ...District[]]).nullable(),
  constraints: z.array(z.enum(CONSTRAINT_KEYS as [Constraint, ...Constraint[]])).max(CONSTRAINT_KEYS.length),
});

const voteBody = z.object({ placeId: z.number().int().positive() });
const finishBody = z.object({ placeId: z.number().int().positive().optional() });
const eventBody = z.object({ name: z.enum(['route_opened']) });
const tripId = z.string().min(1).max(32).regex(/^[\w-]+$/);

/** Тело запроса по схеме; null — если тело испорчено или не подходит. */
async function parseBody<T>(c: Context, schema: z.ZodType<T>): Promise<T | null> {
  const raw = await readJson(c);
  if (raw === INVALID_JSON) return null;
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

async function loadTrip(id: string): Promise<Trip | undefined> {
  if (!tripId.safeParse(id).success) return undefined;
  return db.query.trips.findFirst({ where: eq(trips.id, id) });
}

async function currentSuggestions(trip: Trip) {
  return db
    .select({ suggestion: tripSuggestions, place: places })
    .from(tripSuggestions)
    .innerJoin(places, eq(places.id, tripSuggestions.placeId))
    .where(and(eq(tripSuggestions.tripId, trip.id), eq(tripSuggestions.round, trip.round)))
    .orderBy(tripSuggestions.rank);
}

async function voteTally(tripId: string): Promise<Map<number, number>> {
  const rows = await db.select().from(votes).where(eq(votes.tripId, tripId));
  const tally = new Map<number, number>();
  for (const v of rows) tally.set(v.placeId, (tally.get(v.placeId) ?? 0) + 1);
  return tally;
}

/** Всё, что нужно экрану вылазки, одним ответом. */
async function tripView(trip: Trip, userId: number) {
  const [organizer, answers, suggestions, tally, allVotes, chosen, link] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, trip.organizerId) }),
    db
      .select({ answer: tripAnswers, user: users })
      .from(tripAnswers)
      .innerJoin(users, eq(users.id, tripAnswers.userId))
      .where(eq(tripAnswers.tripId, trip.id)),
    currentSuggestions(trip),
    voteTally(trip.id),
    db.select().from(votes).where(eq(votes.tripId, trip.id)),
    trip.chosenPlaceId ? db.query.places.findFirst({ where: eq(places.id, trip.chosenPlaceId) }) : undefined,
    tripLink(trip.id),
  ]);

  const mine = answers.find((a) => a.user.id === userId)?.answer;
  return {
    id: trip.id,
    status: trip.status,
    round: trip.round,
    startsAt: trip.startsAt.toISOString(),
    startsAtLabel: formatTripDate(trip.startsAt),
    isOrganizer: trip.organizerId === userId,
    organizer: organizer && { id: organizer.id, firstName: organizer.firstName, photoUrl: organizer.photoUrl },
    participants: answers.map((a) => ({ id: a.user.id, firstName: a.user.firstName, photoUrl: a.user.photoUrl })),
    myAnswer: mine
      ? { budget: mine.budget, moods: mine.moods, district: mine.district, constraints: mine.constraints }
      : null,
    suggestions: suggestions.map((s) => ({
      place: placeCard(s.place),
      explanation: s.suggestion.explanation,
      votes: tally.get(s.place.id) ?? 0,
    })),
    myVote: allVotes.find((v) => v.userId === userId)?.placeId ?? null,
    chosenPlace: chosen ? placeCard(chosen) : null,
    link,
  };
}

export const tripRoutes = new Hono<AppEnv>();
tripRoutes.use('*', requireUser);

// 1. Организатор создаёт вылазку.
tripRoutes.post('/', async (c) => {
  const user = c.get('user');
  const body = await parseBody(c, createTripBody);
  if (!body) return fail(c, 400, 'bad_request', 'Укажите дату и время встречи');
  const startsAt = new Date(body.startsAt);
  const now = Date.now();
  if (startsAt.getTime() < now - 60 * 60_000 || startsAt.getTime() > now + MAX_DAYS_AHEAD * 86_400_000) {
    return fail(c, 400, 'bad_date', `Дата должна быть в ближайшие ${MAX_DAYS_AHEAD} дней`);
  }
  const [trip] = await db.insert(trips).values({ id: nanoid(10), organizerId: user.id, startsAt }).returning();
  await track('trip_created', { userId: user.id, tripId: trip!.id });
  return c.json(await tripView(trip!, user.id), 201);
});

// Экран вылазки.
tripRoutes.get('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const trip = await loadTrip(id);
  if (!trip) return fail(c, 404, 'not_found', 'Вылазка не найдена');
  if (trip.organizerId !== user.id) await track('trip_opened', { userId: user.id, tripId: id });
  return c.json(await tripView(trip, user.id));
});

// 3. Участник отвечает на анкету (можно менять до запуска подбора).
tripRoutes.put('/:id/answer', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await parseBody(c, answerBody);
  if (!body) return fail(c, 400, 'bad_request', 'Проверьте ответы анкеты');
  const trip = await loadTrip(id);
  if (!trip) return fail(c, 404, 'not_found', 'Вылазка не найдена');
  if (trip.status !== 'collecting') {
    return fail(c, 409, 'closed', 'Подбор уже запущен — теперь можно только голосовать');
  }
  const values = { ...body, updatedAt: new Date() };
  await db
    .insert(tripAnswers)
    .values({ tripId: id, userId: user.id, ...values })
    .onConflictDoUpdate({ target: [tripAnswers.tripId, tripAnswers.userId], set: values });
  await track('answer_submitted', { userId: user.id, tripId: id, props: body });
  return c.json(await tripView(trip, user.id));
});

// 4–5. Организатор запускает подбор (повторный вызов = «другие варианты»).
tripRoutes.post('/:id/suggest', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const trip = await loadTrip(id);
  if (!trip) return fail(c, 404, 'not_found', 'Вылазка не найдена');
  if (trip.organizerId !== user.id) return fail(c, 403, 'forbidden', 'Подбор запускает организатор');
  if (trip.status === 'decided') return fail(c, 409, 'decided', 'Место уже выбрано');

  const answers = await db.select().from(tripAnswers).where(eq(tripAnswers.tripId, id));
  if (answers.length === 0) return fail(c, 409, 'no_answers', 'Сначала заполните анкету');

  const shown = await db
    .select({ placeId: tripSuggestions.placeId })
    .from(tripSuggestions)
    .where(eq(tripSuggestions.tripId, id));
  const allPlaces = await db.select().from(places).where(eq(places.isActive, true));
  const results = matchPlaces({
    places: allPlaces,
    answers,
    startsAt: trip.startsAt,
    excludePlaceIds: shown.map((s) => s.placeId),
  });
  if (results.length === 0) {
    return fail(c, 409, 'nothing_left', 'Подходящих мест больше нет — попробуйте изменить время');
  }

  // Без транзакции (драйвер Neon по HTTP их не поддерживает), поэтому порядок важен:
  // сначала новые варианты, потом переключение раунда, потом сброс голосов.
  // Если шаг упадёт посередине, экран покажет прежний раунд, а повтор подбора всё исправит.
  const round = trip.round + 1;
  await db
    .insert(tripSuggestions)
    .values(results.map((r, i) => ({ tripId: id, placeId: r.placeId, round, rank: i, explanation: r.explanation })));
  const [updated] = await db.update(trips).set({ round, status: 'voting' }).where(eq(trips.id, id)).returning();
  await db.delete(votes).where(eq(votes.tripId, id)); // новая тройка — голосуем заново

  await track(round === 1 ? 'suggestions_generated' : 'more_options_requested', {
    userId: user.id,
    tripId: id,
    props: { round, answers: answers.length, placeIds: results.map((r) => r.placeId), relaxed: results[0]?.relaxed },
  });
  return c.json(await tripView(updated!, user.id));
});

// 6. Голосование: один голос на участника, можно переголосовать.
tripRoutes.post('/:id/vote', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await parseBody(c, voteBody);
  if (!body) return fail(c, 400, 'bad_request', 'Выберите место');
  const trip = await loadTrip(id);
  if (!trip) return fail(c, 404, 'not_found', 'Вылазка не найдена');
  if (trip.status !== 'voting') return fail(c, 409, 'not_voting', 'Сейчас голосование не идёт');

  const options = await currentSuggestions(trip);
  if (!options.some((o) => o.place.id === body.placeId)) {
    return fail(c, 400, 'bad_place', 'Этого места нет среди вариантов');
  }
  await db
    .insert(votes)
    .values({ tripId: id, userId: user.id, placeId: body.placeId })
    .onConflictDoUpdate({ target: [votes.tripId, votes.userId], set: { placeId: body.placeId, createdAt: new Date() } });
  await track('vote_cast', { userId: user.id, tripId: id, props: { placeId: body.placeId } });
  return c.json(await tripView(trip, user.id));
});

// 7. Организатор завершает голосование. При ничьей выбирает сам.
tripRoutes.post('/:id/finish', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await parseBody(c, finishBody);
  if (!body) return fail(c, 400, 'bad_request', 'Некорректный запрос');
  const trip = await loadTrip(id);
  if (!trip) return fail(c, 404, 'not_found', 'Вылазка не найдена');
  if (trip.organizerId !== user.id) return fail(c, 403, 'forbidden', 'Завершает организатор');
  if (trip.status !== 'voting') return fail(c, 409, 'not_voting', 'Сейчас голосование не идёт');

  const options = (await currentSuggestions(trip)).map((o) => o.place.id);
  const tally = await voteTally(id);
  // Считаем только голоса за текущую тройку.
  const max = Math.max(0, ...options.map((p) => tally.get(p) ?? 0));
  const leaders = max > 0 ? options.filter((p) => (tally.get(p) ?? 0) === max) : options;

  let chosenId: number;
  if (body.placeId !== undefined) {
    if (!leaders.includes(body.placeId)) {
      return fail(c, 400, 'bad_place', 'Выбрать можно только из лидеров голосования');
    }
    chosenId = body.placeId;
  } else if (leaders.length === 1) {
    chosenId = leaders[0]!;
  } else {
    return fail(c, 409, 'tie', 'Ничья — выберите место сами', { leaders });
  }

  const [updated] = await db
    .update(trips)
    .set({ status: 'decided', chosenPlaceId: chosenId, decidedAt: new Date() })
    .where(eq(trips.id, id))
    .returning();
  const by = max > 0 && leaders.length === 1 ? 'vote' : 'organizer';
  await track('place_chosen', { userId: user.id, tripId: id, props: { placeId: chosenId, round: trip.round, by } });
  // Карточки рассылаются после ответа: организатору не нужно ждать, пока бот напишет всем.
  inBackground(c, sendResultCards(updated!));
  return c.json(await tripView(updated!, user.id));
});

/** На Cloudflare работа после ответа держится через waitUntil, в Node процесс и так продолжает жить. */
function inBackground(c: Context, task: Promise<unknown>): void {
  const safe = task.catch((err) => console.error('Фоновая задача упала:', err));
  try {
    c.executionCtx.waitUntil(safe);
  } catch {
    // Node.js: executionCtx нет — промис доработает сам.
  }
}

/** Карточка итога в личный чат с ботом — организатору и всем, кто ответил на анкету или голосовал. */
async function sendResultCards(trip: Trip): Promise<void> {
  if (!trip.chosenPlaceId) return;
  const [place, answered, voted] = await Promise.all([
    db.query.places.findFirst({ where: eq(places.id, trip.chosenPlaceId) }),
    db
      .select({ id: users.id, firstName: users.firstName })
      .from(tripAnswers)
      .innerJoin(users, eq(users.id, tripAnswers.userId))
      .where(eq(tripAnswers.tripId, trip.id)),
    db.select({ id: votes.userId }).from(votes).where(eq(votes.tripId, trip.id)),
  ]);
  if (!place) return;
  const recipients = [...new Set([trip.organizerId, ...answered.map((a) => a.id), ...voted.map((v) => v.id)])];
  const buttons: BotMessage['buttons'] = [{ text: 'Маршрут', url: yandexMapsLink(place) }];
  const site = websiteUrl(place.website);
  if (site) buttons.push({ text: 'Сайт места', url: site });
  const messages: BotMessage[] = [
    { html: resultCardText({ place, startsAt: trip.startsAt, participants: answered.map((a) => a.firstName) }), buttons },
  ];
  if (config.WEB_APP_URL.startsWith('https://')) {
    messages.push({
      html: 'Хорошо вам провести время! 🙌\nКогда захочется снова куда-нибудь выбраться — соберите новую вылазку.',
      buttons: [{ text: 'Собрать новую вылазку', webApp: config.WEB_APP_URL }],
    });
  }
  const result = await sendToUsers(recipients, messages);
  await track('result_card_sent', { userId: trip.organizerId, tripId: trip.id, props: result });
}

// 2. Сообщение-приглашение для отправки в чат друзей.
tripRoutes.post('/:id/share/invite', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const trip = await loadTrip(id);
  if (!trip) return fail(c, 404, 'not_found', 'Вылазка не найдена');
  const link = await tripLink(id);
  if (!link) return fail(c, 503, 'bot_disabled', 'Бот не подключён');
  const messageId = await prepareShareMessage(user.id, {
    title: 'Приглашение на вылазку',
    text: `${user.firstName} собирает вылазку: ${formatTripDate(trip.startsAt)}.\nОтветь за 30 секунд — подберём место, которое подойдёт всем.`,
    buttons: [{ text: 'Участвовать', url: link }],
  });
  return c.json({ preparedMessageId: messageId });
});

// 7. Итог для отправки в чат.
tripRoutes.post('/:id/share/result', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const trip = await loadTrip(id);
  if (!trip || !trip.chosenPlaceId) return fail(c, 409, 'not_decided', 'Место ещё не выбрано');
  const place = (await db.query.places.findFirst({ where: eq(places.id, trip.chosenPlaceId) })) as Place;
  const link = await tripLink(id);
  if (!link) return fail(c, 503, 'bot_disabled', 'Бот не подключён');
  // Название может уже содержать кавычки («Кафе «Маяк»») — тогда не добавляем свои.
  const quoted = place.name.includes('«') ? place.name : `«${place.name}»`;
  const messageId = await prepareShareMessage(user.id, {
    title: `Идём в ${quoted}`,
    text: `Идём в ${quoted}!\n${formatTripDate(trip.startsAt)}\n${place.address}`,
    buttons: [
      { text: 'Маршрут', url: yandexMapsLink(place) },
      { text: 'Открыть вылазку', url: link },
    ],
  });
  return c.json({ preparedMessageId: messageId });
});

// События, которые знает только клиент (например, открытие маршрута).
tripRoutes.post('/:id/events', async (c) => {
  const user = c.get('user');
  const body = await parseBody(c, eventBody);
  if (!body) return fail(c, 400, 'bad_request', 'Неизвестное событие');
  await track(body.name, { userId: user.id, tripId: c.req.param('id') });
  return c.body(null, 204);
});
