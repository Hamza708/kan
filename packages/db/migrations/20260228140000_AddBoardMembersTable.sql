CREATE TABLE IF NOT EXISTS "board_members" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"publicId" varchar(12) NOT NULL,
	"boardId" bigint NOT NULL,
	"userId" uuid NOT NULL,
	"createdBy" uuid,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"deletedAt" timestamp,
	"deletedBy" uuid,
	CONSTRAINT "board_members_publicId_unique" UNIQUE("publicId")
);
--> statement-breakpoint
ALTER TABLE "board_members" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "board_members" ADD CONSTRAINT "board_members_boardId_board_id_fk" FOREIGN KEY ("boardId") REFERENCES "public"."board"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "board_members" ADD CONSTRAINT "board_members_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "board_members" ADD CONSTRAINT "board_members_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "board_members" ADD CONSTRAINT "board_members_deletedBy_user_id_fk" FOREIGN KEY ("deletedBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "board_members_board_idx" ON "board_members" USING btree ("boardId");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "board_members_board_user_unique" ON "board_members" USING btree ("boardId","userId") WHERE "deletedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "board_members_user_idx" ON "board_members" USING btree ("userId");
--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE "public"."notification_type" ADD VALUE 'board.member.added';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
INSERT INTO "board_members" ("publicId", "boardId", "userId", "createdBy", "createdAt")
SELECT DISTINCT ON (b.id, wm."userId")
  substring(replace(gen_random_uuid()::text, '-', ''), 1, 12),
  b.id,
  wm."userId",
  wm."userId",
  now()
FROM "board" b
INNER JOIN "workspace_members" wm ON wm."workspaceId" = b."workspaceId" AND wm."deletedAt" IS NULL AND wm."status" = 'active' AND wm."userId" IS NOT NULL
WHERE b."deletedAt" IS NULL;
