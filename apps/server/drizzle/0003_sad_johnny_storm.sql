ALTER TABLE "trip_answers" ADD COLUMN "districts" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
-- Перенос старых ответов: один район → список из одного района.
UPDATE "trip_answers" SET "districts" = ARRAY["district"] WHERE "district" IS NOT NULL;
