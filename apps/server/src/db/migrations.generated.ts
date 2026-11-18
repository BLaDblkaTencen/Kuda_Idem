// Сгенерировано scripts/embed-migrations.mjs — не редактируйте вручную.
export const MIGRATIONS: ReadonlyArray<{ tag: string; statements: readonly string[] }> = [
  {
    "tag": "0000_unknown_the_santerians",
    "statements": [
      "CREATE TABLE \"events\" (\n\t\"id\" serial PRIMARY KEY NOT NULL,\n\t\"name\" text NOT NULL,\n\t\"user_id\" bigint,\n\t\"trip_id\" text,\n\t\"props\" jsonb DEFAULT '{}'::jsonb NOT NULL,\n\t\"created_at\" timestamp with time zone DEFAULT now() NOT NULL\n);",
      "CREATE TABLE \"places\" (\n\t\"id\" serial PRIMARY KEY NOT NULL,\n\t\"city\" text DEFAULT 'sevastopol' NOT NULL,\n\t\"name\" text NOT NULL,\n\t\"type\" text NOT NULL,\n\t\"district\" text NOT NULL,\n\t\"address\" text NOT NULL,\n\t\"lat\" double precision,\n\t\"lon\" double precision,\n\t\"avg_check\" integer NOT NULL,\n\t\"moods\" text[] DEFAULT '{}' NOT NULL,\n\t\"vibes\" text[] DEFAULT '{}' NOT NULL,\n\t\"features\" text[] DEFAULT '{}' NOT NULL,\n\t\"max_group_size\" integer DEFAULT 6 NOT NULL,\n\t\"no_order_ok\" boolean DEFAULT false NOT NULL,\n\t\"hours\" jsonb,\n\t\"season\" text DEFAULT 'all_year' NOT NULL,\n\t\"description\" text DEFAULT '' NOT NULL,\n\t\"photos\" text[] DEFAULT '{}' NOT NULL,\n\t\"partner_offer\" text,\n\t\"verified_at\" date,\n\t\"is_test_data\" boolean DEFAULT false NOT NULL\n);",
      "CREATE TABLE \"trip_answers\" (\n\t\"trip_id\" text NOT NULL,\n\t\"user_id\" bigint NOT NULL,\n\t\"budget\" integer,\n\t\"moods\" text[] DEFAULT '{}' NOT NULL,\n\t\"district\" text,\n\t\"constraints\" text[] DEFAULT '{}' NOT NULL,\n\t\"updated_at\" timestamp with time zone DEFAULT now() NOT NULL,\n\tCONSTRAINT \"trip_answers_trip_id_user_id_pk\" PRIMARY KEY(\"trip_id\",\"user_id\")\n);",
      "CREATE TABLE \"trip_suggestions\" (\n\t\"trip_id\" text NOT NULL,\n\t\"place_id\" integer NOT NULL,\n\t\"round\" integer NOT NULL,\n\t\"rank\" integer NOT NULL,\n\t\"explanation\" text NOT NULL,\n\tCONSTRAINT \"trip_suggestions_trip_id_place_id_pk\" PRIMARY KEY(\"trip_id\",\"place_id\")\n);",
      "CREATE TABLE \"trips\" (\n\t\"id\" text PRIMARY KEY NOT NULL,\n\t\"organizer_id\" bigint NOT NULL,\n\t\"starts_at\" timestamp with time zone NOT NULL,\n\t\"status\" text DEFAULT 'collecting' NOT NULL,\n\t\"round\" integer DEFAULT 0 NOT NULL,\n\t\"chosen_place_id\" integer,\n\t\"created_at\" timestamp with time zone DEFAULT now() NOT NULL,\n\t\"decided_at\" timestamp with time zone\n);",
      "CREATE TABLE \"users\" (\n\t\"id\" bigint PRIMARY KEY NOT NULL,\n\t\"first_name\" text NOT NULL,\n\t\"last_name\" text,\n\t\"username\" text,\n\t\"photo_url\" text,\n\t\"created_at\" timestamp with time zone DEFAULT now() NOT NULL\n);",
      "CREATE TABLE \"votes\" (\n\t\"trip_id\" text NOT NULL,\n\t\"user_id\" bigint NOT NULL,\n\t\"place_id\" integer NOT NULL,\n\t\"created_at\" timestamp with time zone DEFAULT now() NOT NULL,\n\tCONSTRAINT \"votes_trip_id_user_id_pk\" PRIMARY KEY(\"trip_id\",\"user_id\")\n);",
      "ALTER TABLE \"trip_answers\" ADD CONSTRAINT \"trip_answers_trip_id_trips_id_fk\" FOREIGN KEY (\"trip_id\") REFERENCES \"public\".\"trips\"(\"id\") ON DELETE cascade ON UPDATE no action;",
      "ALTER TABLE \"trip_answers\" ADD CONSTRAINT \"trip_answers_user_id_users_id_fk\" FOREIGN KEY (\"user_id\") REFERENCES \"public\".\"users\"(\"id\") ON DELETE no action ON UPDATE no action;",
      "ALTER TABLE \"trip_suggestions\" ADD CONSTRAINT \"trip_suggestions_trip_id_trips_id_fk\" FOREIGN KEY (\"trip_id\") REFERENCES \"public\".\"trips\"(\"id\") ON DELETE cascade ON UPDATE no action;",
      "ALTER TABLE \"trip_suggestions\" ADD CONSTRAINT \"trip_suggestions_place_id_places_id_fk\" FOREIGN KEY (\"place_id\") REFERENCES \"public\".\"places\"(\"id\") ON DELETE no action ON UPDATE no action;",
      "ALTER TABLE \"trips\" ADD CONSTRAINT \"trips_organizer_id_users_id_fk\" FOREIGN KEY (\"organizer_id\") REFERENCES \"public\".\"users\"(\"id\") ON DELETE no action ON UPDATE no action;",
      "ALTER TABLE \"trips\" ADD CONSTRAINT \"trips_chosen_place_id_places_id_fk\" FOREIGN KEY (\"chosen_place_id\") REFERENCES \"public\".\"places\"(\"id\") ON DELETE no action ON UPDATE no action;",
      "ALTER TABLE \"votes\" ADD CONSTRAINT \"votes_trip_id_trips_id_fk\" FOREIGN KEY (\"trip_id\") REFERENCES \"public\".\"trips\"(\"id\") ON DELETE cascade ON UPDATE no action;",
      "ALTER TABLE \"votes\" ADD CONSTRAINT \"votes_user_id_users_id_fk\" FOREIGN KEY (\"user_id\") REFERENCES \"public\".\"users\"(\"id\") ON DELETE no action ON UPDATE no action;",
      "ALTER TABLE \"votes\" ADD CONSTRAINT \"votes_place_id_places_id_fk\" FOREIGN KEY (\"place_id\") REFERENCES \"public\".\"places\"(\"id\") ON DELETE no action ON UPDATE no action;",
      "CREATE INDEX \"events_name_created_idx\" ON \"events\" USING btree (\"name\",\"created_at\");"
    ]
  },
  {
    "tag": "0001_sticky_patriot",
    "statements": [
      "ALTER TABLE \"places\" ADD COLUMN \"external_id\" text;",
      "ALTER TABLE \"places\" ADD COLUMN \"website\" text;",
      "ALTER TABLE \"places\" ADD COLUMN \"is_active\" boolean DEFAULT true NOT NULL;",
      "ALTER TABLE \"places\" ADD CONSTRAINT \"places_external_id_unique\" UNIQUE(\"external_id\");"
    ]
  },
  {
    "tag": "0002_nebulous_doctor_doom",
    "statements": [
      "ALTER TABLE \"places\" ADD COLUMN \"kind\" text;"
    ]
  },
  {
    "tag": "0003_sad_johnny_storm",
    "statements": [
      "ALTER TABLE \"trip_answers\" ADD COLUMN \"districts\" text[] DEFAULT '{}' NOT NULL;",
      "-- Перенос старых ответов: один район → список из одного района.\nUPDATE \"trip_answers\" SET \"districts\" = ARRAY[\"district\"] WHERE \"district\" IS NOT NULL;"
    ]
  },
  {
    "tag": "0004_worried_famine",
    "statements": [
      "ALTER TABLE \"trip_answers\" DROP COLUMN \"district\";"
    ]
  },
  {
    "tag": "0005_cool_tyrannus",
    "statements": [
      "ALTER TABLE \"users\" ADD COLUMN \"last_prompt_message_id\" integer;"
    ]
  }
];
