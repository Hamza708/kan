import { and, eq } from "drizzle-orm";

import type { dbClient } from "@kan/db/client";
import { cardWatchers } from "@kan/db/schema";

export const toggle = async (
  db: dbClient,
  args: { cardId: number; userId: string },
): Promise<{ watching: boolean }> => {
  const existing = await db.query.cardWatchers.findFirst({
    where: (cw, { and, eq }) =>
      and(eq(cw.cardId, args.cardId), eq(cw.userId, args.userId)),
  });

  if (existing) {
    await db
      .delete(cardWatchers)
      .where(
        and(
          eq(cardWatchers.cardId, args.cardId),
          eq(cardWatchers.userId, args.userId),
        ),
      );
    return { watching: false };
  }

  await db.insert(cardWatchers).values({
    cardId: args.cardId,
    userId: args.userId,
  });
  return { watching: true };
};

export const addWatcher = async (
  db: dbClient,
  args: { cardId: number; userId: string },
): Promise<void> => {
  await db
    .insert(cardWatchers)
    .values({ cardId: args.cardId, userId: args.userId })
    .onConflictDoNothing();
};

export const isWatching = async (
  db: dbClient,
  args: { cardId: number; userId: string },
): Promise<boolean> => {
  const result = await db.query.cardWatchers.findFirst({
    where: (cw, { and, eq }) =>
      and(eq(cw.cardId, args.cardId), eq(cw.userId, args.userId)),
  });
  return !!result;
};

export const getWatcherUserIds = async (
  db: dbClient,
  cardId: number,
): Promise<string[]> => {
  const rows = await db
    .select({ userId: cardWatchers.userId })
    .from(cardWatchers)
    .where(eq(cardWatchers.cardId, cardId));
  return rows.map((r) => r.userId);
};
