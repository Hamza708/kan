CREATE TABLE IF NOT EXISTS "_card_watchers" (
  "cardId" bigint NOT NULL REFERENCES "card"("id") ON DELETE CASCADE,
  "userId" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY ("cardId", "userId")
);

ALTER TABLE "_card_watchers" ENABLE ROW LEVEL SECURITY;
