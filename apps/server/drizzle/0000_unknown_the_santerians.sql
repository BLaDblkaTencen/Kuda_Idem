CREATE TABLE "events" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"user_id" bigint,
	"trip_id" text,
	"props" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "places" (
	"id" serial PRIMARY KEY NOT NULL,
	"city" text DEFAULT 'sevastopol' NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"district" text NOT NULL,
	"address" text NOT NULL,
	"lat" double precision,
	"lon" double precision,
	"avg_check" integer NOT NULL,
	"moods" text[] DEFAULT '{}' NOT NULL,
	"vibes" text[] DEFAULT '{}' NOT NULL,
	"features" text[] DEFAULT '{}' NOT NULL,
	"max_group_size" integer DEFAULT 6 NOT NULL,
	"no_order_ok" boolean DEFAULT false NOT NULL,
	"hours" jsonb,
	"season" text DEFAULT 'all_year' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"photos" text[] DEFAULT '{}' NOT NULL,
	"partner_offer" text,
	"verified_at" date,
	"is_test_data" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_answers" (
	"trip_id" text NOT NULL,
	"user_id" bigint NOT NULL,
	"budget" integer,
	"moods" text[] DEFAULT '{}' NOT NULL,
	"district" text,
	"constraints" text[] DEFAULT '{}' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_answers_trip_id_user_id_pk" PRIMARY KEY("trip_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "trip_suggestions" (
	"trip_id" text NOT NULL,
	"place_id" integer NOT NULL,
	"round" integer NOT NULL,
	"rank" integer NOT NULL,
	"explanation" text NOT NULL,
	CONSTRAINT "trip_suggestions_trip_id_place_id_pk" PRIMARY KEY("trip_id","place_id")
);
--> statement-breakpoint
CREATE TABLE "trips" (
	"id" text PRIMARY KEY NOT NULL,
	"organizer_id" bigint NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'collecting' NOT NULL,
	"round" integer DEFAULT 0 NOT NULL,
	"chosen_place_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" bigint PRIMARY KEY NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text,
	"username" text,
	"photo_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "votes" (
	"trip_id" text NOT NULL,
	"user_id" bigint NOT NULL,
	"place_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "votes_trip_id_user_id_pk" PRIMARY KEY("trip_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "trip_answers" ADD CONSTRAINT "trip_answers_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_answers" ADD CONSTRAINT "trip_answers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_suggestions" ADD CONSTRAINT "trip_suggestions_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_suggestions" ADD CONSTRAINT "trip_suggestions_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_organizer_id_users_id_fk" FOREIGN KEY ("organizer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_chosen_place_id_places_id_fk" FOREIGN KEY ("chosen_place_id") REFERENCES "public"."places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_name_created_idx" ON "events" USING btree ("name","created_at");