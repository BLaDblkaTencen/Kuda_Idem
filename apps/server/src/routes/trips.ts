import type { FastifyInstance, FastifyReply } from 'fastify';
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
import { track } from '../analytics.js';
import { prepareShareMessage, tripLink } from '../bot.js';
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
const tripParams = z.object({ id: z.string().min(1).max(32) });

function fail(reply: FastifyReply, status: number, error: string, message: string) {
  return reply.code(status).send({ error, message });
}

async function loadTrip(id: string): Promise<Trip | undefined> {
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
  const [organizer, answers, suggestions, tally, allVotes, chosen] = await Promise.all([
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
    link: tripLink(trip.id),
  };
}

export async function tripRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireUser);

  // 1. Организатор создаёт вылазку.
  app.post('/api/trips', async (req, reply) => {
    const body = createTripBody.safeParse(req.body);
    if (!body.success) return fail(reply, 400, 'bad_request', 'Укажите дату и время встречи');
    const startsAt = new Date(body.data.startsAt);
    const now = Date.now();
    if (startsAt.getTime() < now - 60 * 60_000 || startsAt.getTime() > now + MAX_DAYS_AHEAD * 86_400_000) {
      return fail(reply, 400, 'bad_date', `Дата должна быть в ближайшие ${MAX_DAYS_AHEAD} дней`);
    }
    const [trip] = await db
      .insert(trips)
      .values({ id: nanoid(10), organizerId: req.user.id, startsAt })
      .returning();
    await track('trip_created', { userId: req.user.id, tripId: trip!.id });
    return reply.code(201).send(await tripView(trip!, req.user.id));
  });

  // Экран вылазки.
  app.get('/api/trips/:id', async (req, reply) => {
    const { id } = tripParams.parse(req.params);
    const trip = await loadTrip(id);
    if (!trip) return fail(reply, 404, 'not_found', 'Вылазка не найдена');
    if (trip.organizerId !== req.user.id) await track('trip_opened', { userId: req.user.id, tripId: id });
    return tripView(trip, req.user.id);
  });

  // 3. Участник отвечает на анкету (можно менять до запуска подбора).
  app.put('/api/trips/:id/answer', async (req, reply) => {
    const { id } = tripParams.parse(req.params);
    const body = answerBody.safeParse(req.body);
    if (!body.success) return fail(reply, 400, 'bad_request', 'Проверьте ответы анкеты');
    const trip = await loadTrip(id);
    if (!trip) return fail(reply, 404, 'not_found', 'Вылазка не найдена');
    if (trip.status !== 'collecting') {
      return fail(reply, 409, 'closed', 'Подбор уже запущен — теперь можно только голосовать');
    }
    const values = { ...body.data, updatedAt: new Date() };
    await db
      .insert(tripAnswers)
      .values({ tripId: id, userId: req.user.id, ...values })
      .onConflictDoUpdate({ target: [tripAnswers.tripId, tripAnswers.userId], set: values });
    await track('answer_submitted', { userId: req.user.id, tripId: id, props: body.data });
    return tripView(trip, req.user.id);
  });

  // 4–5. Организатор запускает подбор (повторный вызов = «другие варианты»).
  app.post('/api/trips/:id/suggest', async (req, reply) => {
    const { id } = tripParams.parse(req.params);
    const trip = await loadTrip(id);
    if (!trip) return fail(reply, 404, 'not_found', 'Вылазка не найдена');
    if (trip.organizerId !== req.user.id) return fail(reply, 403, 'forbidden', 'Подбор запускает организатор');
    if (trip.status === 'decided') return fail(reply, 409, 'decided', 'Место уже выбрано');

    const answers = await db.select().from(tripAnswers).where(eq(tripAnswers.tripId, id));
    if (answers.length === 0) return fail(reply, 409, 'no_answers', 'Сначала заполните анкету');

    const shown = await db
      .select({ placeId: tripSuggestions.placeId })
      .from(tripSuggestions)
      .where(eq(tripSuggestions.tripId, id));
    const allPlaces = await db.select().from(places);
    const results = matchPlaces({
      places: allPlaces,
      answers,
      startsAt: trip.startsAt,
      excludePlaceIds: shown.map((s) => s.placeId),
    });
    if (results.length === 0) {
      return fail(reply, 409, 'nothing_left', 'Подходящих мест больше нет — попробуйте изменить время');
    }

    const round = trip.round + 1;
    const updated = await db.transaction(async (tx) => {
      await tx.insert(tripSuggestions).values(
        results.map((r, i) => ({ tripId: id, placeId: r.placeId, round, rank: i, explanation: r.explanation })),
      );
      await tx.delete(votes).where(eq(votes.tripId, id)); // новая тройка — голосуем заново
      const [t] = await tx.update(trips).set({ round, status: 'voting' }).where(eq(trips.id, id)).returning();
      return t!;
    });

    await track(round === 1 ? 'suggestions_generated' : 'more_options_requested', {
      userId: req.user.id,
      tripId: id,
      props: { round, answers: answers.length, placeIds: results.map((r) => r.placeId), relaxed: results[0]?.relaxed },
    });
    return tripView(updated, req.user.id);
  });

  // 6. Голосование: один голос на участника, можно переголосовать.
  app.post('/api/trips/:id/vote', async (req, reply) => {
    const { id } = tripParams.parse(req.params);
    const body = voteBody.safeParse(req.body);
    if (!body.success) return fail(reply, 400, 'bad_request', 'Выберите место');
    const trip = await loadTrip(id);
    if (!trip) return fail(reply, 404, 'not_found', 'Вылазка не найдена');
    if (trip.status !== 'voting') return fail(reply, 409, 'not_voting', 'Сейчас голосование не идёт');

    const options = await currentSuggestions(trip);
    if (!options.some((o) => o.place.id === body.data.placeId)) {
      return fail(reply, 400, 'bad_place', 'Этого места нет среди вариантов');
    }
    await db
      .insert(votes)
      .values({ tripId: id, userId: req.user.id, placeId: body.data.placeId })
      .onConflictDoUpdate({
        target: [votes.tripId, votes.userId],
        set: { placeId: body.data.placeId, createdAt: new Date() },
      });
    await track('vote_cast', { userId: req.user.id, tripId: id, props: { placeId: body.data.placeId } });
    return tripView(trip, req.user.id);
  });

  // 7. Организатор завершает голосование. При ничьей выбирает сам.
  app.post('/api/trips/:id/finish', async (req, reply) => {
    const { id } = tripParams.parse(req.params);
    const body = finishBody.safeParse(req.body ?? {});
    if (!body.success) return fail(reply, 400, 'bad_request', 'Некорректный запрос');
    const trip = await loadTrip(id);
    if (!trip) return fail(reply, 404, 'not_found', 'Вылазка не найдена');
    if (trip.organizerId !== req.user.id) return fail(reply, 403, 'forbidden', 'Завершает организатор');
    if (trip.status !== 'voting') return fail(reply, 409, 'not_voting', 'Сейчас голосование не идёт');

    const options = (await currentSuggestions(trip)).map((o) => o.place.id);
    const tally = await voteTally(id);
    const max = Math.max(0, ...tally.values());
    const leaders = max > 0 ? options.filter((p) => tally.get(p) === max) : options;

    let chosenId: number;
    if (body.data.placeId !== undefined) {
      if (!leaders.includes(body.data.placeId)) {
        return fail(reply, 400, 'bad_place', 'Выбрать можно только из лидеров голосования');
      }
      chosenId = body.data.placeId;
    } else if (leaders.length === 1) {
      chosenId = leaders[0]!;
    } else {
      return reply.code(409).send({ error: 'tie', message: 'Ничья — выберите место сами', leaders });
    }

    const [updated] = await db
      .update(trips)
      .set({ status: 'decided', chosenPlaceId: chosenId, decidedAt: new Date() })
      .where(eq(trips.id, id))
      .returning();
    const fromSuggestions = tally.size > 0 && leaders.length === 1 ? 'vote' : 'organizer';
    await track('place_chosen', { userId: req.user.id, tripId: id, props: { placeId: chosenId, round: trip.round, by: fromSuggestions } });
    return tripView(updated!, req.user.id);
  });

  // 2. Сообщение-приглашение для отправки в чат друзей.
  app.post('/api/trips/:id/share/invite', async (req, reply) => {
    const { id } = tripParams.parse(req.params);
    const trip = await loadTrip(id);
    if (!trip) return fail(reply, 404, 'not_found', 'Вылазка не найдена');
    const link = tripLink(id);
    if (!link) return fail(reply, 503, 'bot_disabled', 'Бот не подключён');
    const messageId = await prepareShareMessage(req.user.id, {
      title: 'Приглашение на вылазку',
      text: `${req.user.firstName} собирает вылазку: ${formatTripDate(trip.startsAt)}.\nОтветь за 30 секунд — подберём место, которое подойдёт всем.`,
      buttons: [{ text: 'Участвовать', url: link }],
    });
    return { preparedMessageId: messageId };
  });

  // 7. Итог для отправки в чат.
  app.post('/api/trips/:id/share/result', async (req, reply) => {
    const { id } = tripParams.parse(req.params);
    const trip = await loadTrip(id);
    if (!trip || !trip.chosenPlaceId) return fail(reply, 409, 'not_decided', 'Место ещё не выбрано');
    const place = (await db.query.places.findFirst({ where: eq(places.id, trip.chosenPlaceId) })) as Place;
    const link = tripLink(id);
    if (!link) return fail(reply, 503, 'bot_disabled', 'Бот не подключён');
    // Название может уже содержать кавычки («Кафе «Маяк»») — тогда не добавляем свои.
    const quoted = place.name.includes('«') ? place.name : `«${place.name}»`;
    const messageId = await prepareShareMessage(req.user.id, {
      title: `Идём в ${quoted}`,
      text: `Идём в ${quoted}!\n${formatTripDate(trip.startsAt)}\n${place.address}`,
      buttons: [
        { text: 'Маршрут', url: yandexMapsLink(place) },
        { text: 'Открыть вылазку', url: link },
      ],
    });
    return { preparedMessageId: messageId };
  });

  // События, которые знает только клиент (например, открытие маршрута).
  app.post('/api/trips/:id/events', async (req, reply) => {
    const { id } = tripParams.parse(req.params);
    const body = z.object({ name: z.enum(['route_opened']) }).safeParse(req.body);
    if (!body.success) return fail(reply, 400, 'bad_request', 'Неизвестное событие');
    await track(body.data.name, { userId: req.user.id, tripId: id });
    return reply.code(204).send();
  });
}
