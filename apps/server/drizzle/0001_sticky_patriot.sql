ALTER TABLE "places" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_external_id_unique" UNIQUE("external_id");