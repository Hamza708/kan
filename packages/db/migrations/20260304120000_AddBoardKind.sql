CREATE TYPE "public"."board_kind" AS ENUM ('internal', 'external');--> statement-breakpoint
ALTER TABLE "board" ADD COLUMN "kind" "board_kind" DEFAULT 'internal' NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "board_kind_idx" ON "board" USING btree ("kind");--> statement-breakpoint

