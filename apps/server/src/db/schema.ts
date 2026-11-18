import {
  pgTable,
  serial,
  text,
  integer,
  bigint,
  boolean,
  doublePrecision,
  timestamp,
  date,
  jsonb,
  primaryKey,
  index,
} from 'drizzle-orm/pg-core';

// Часы работы по дням недели: индекс 0 = воскресенье (как Date.getDay()).
// null — выходной. close < open означает работу после полуночи (например 12:00–02:00).
export type WeeklyHours = Array<{ open: string; close: string } | null>;

export const places = pgTable('places', {
  id: serial('id').primaryKey(),
  city: text('city').notNull().default('sevastopol'),
  name: text('name').notNull(),
  type: text('type').notNull(),
  // Вид заведения для людей: «кинотеатр», «бильярдный клуб». type — общая категория для подбора.
  kind: text('kind'),
  district: text('district').notNull(),
  address: text('address').notNull(),
  lat: doublePrecision('lat'),
  lon: doublePrecision('lon'),
  avgCheck: integer('avg_check').notNull(), // ₽ на человека, 0 = бесплатно
  moods: text('moods').array().notNull().default([]),
  vibes: text('vibes').array().notNull().default([]),
  features: text('features').array().notNull().default([]),
  maxGroupSize: integer('max_group_size').notNull().default(6),
  noOrderOk: boolean('no_order_ok').notNull().default(false),
  hours: jsonb('hours').$type<WeeklyHours | null>(), // null = открыто всегда (парк, набережная)
  season: text('season').notNull().default('all_year'),
  description: text('description').notNull().default(''),
  photos: text('photos').array().notNull().default([]),
  partnerOffer: text('partner_offer'), // P2: предложение для групп
  verifiedAt: date('verified_at'),
  isTestData: boolean('is_test_data').notNull().default(false),
  // Id карточки в 2ГИС — по нему места из data/places-sevastopol.csv сопоставляются с базой.
  externalId: text('external_id').unique(),
  website: text('website'),
  // Скрытые места не предлагаются, но остаются в базе: на них ссылаются прошлые вылазки.
  isActive: boolean('is_active').notNull().default(true),
});

export const users = pgTable('users', {
  id: bigint('id', { mode: 'number' }).primaryKey(), // Telegram user id
  firstName: text('first_name').notNull(),
  lastName: text('last_name'),
  username: text('username'),
  photoUrl: text('photo_url'),
  // Последнее сообщение бота с кнопкой «Собрать вылазку» в личном чате: при отправке нового
  // старое удаляется, чтобы такие сообщения не копились.
  lastPromptMessageId: integer('last_prompt_message_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const trips = pgTable('trips', {
  id: text('id').primaryKey(), // короткий id для ссылки
  organizerId: bigint('organizer_id', { mode: 'number' })
    .notNull()
    .references(() => users.id),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  // collecting → voting → decided
  status: text('status').notNull().default('collecting'),
  round: integer('round').notNull().default(0),
  chosenPlaceId: integer('chosen_place_id').references(() => places.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
});

export const tripAnswers = pgTable(
  'trip_answers',
  {
    tripId: text('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => users.id),
    budget: integer('budget'), // null = не важно
    moods: text('moods').array().notNull().default([]),
    districts: text('districts').array().notNull().default([]), // пусто = любой район
    constraints: text('constraints').array().notNull().default([]),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tripId, t.userId] })],
);

export const tripSuggestions = pgTable(
  'trip_suggestions',
  {
    tripId: text('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    placeId: integer('place_id')
      .notNull()
      .references(() => places.id),
    round: integer('round').notNull(),
    rank: integer('rank').notNull(),
    explanation: text('explanation').notNull(),
  },
  (t) => [primaryKey({ columns: [t.tripId, t.placeId] })],
);

export const votes = pgTable(
  'votes',
  {
    tripId: text('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => users.id),
    placeId: integer('place_id')
      .notNull()
      .references(() => places.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tripId, t.userId] })],
);

// Продуктовая аналитика: события из раздела «Метрики» спецификации.
export const events = pgTable(
  'events',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    userId: bigint('user_id', { mode: 'number' }),
    tripId: text('trip_id'),
    props: jsonb('props').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('events_name_created_idx').on(t.name, t.createdAt)],
);

export type Place = typeof places.$inferSelect;
export type NewPlace = typeof places.$inferInsert;
export type Trip = typeof trips.$inferSelect;
export type TripAnswer = typeof tripAnswers.$inferSelect;
