import { and, eq, isNull } from "drizzle-orm";

import type { dbClient } from "@kan/db/client";
import { boardMembers } from "@kan/db/schema";
import { generateUID } from "@kan/shared/utils";

export const add = async (
  db: dbClient,
  args: {
    boardId: number;
    userId: string;
    createdBy: string;
  },
) => {
  const [result] = await db
    .insert(boardMembers)
    .values({
      publicId: generateUID(),
      boardId: args.boardId,
      userId: args.userId,
      createdBy: args.createdBy,
    })
    .returning();
  return result;
};

export const remove = async (
  db: dbClient,
  args: { boardId: number; userId: string; deletedBy: string },
) => {
  const [result] = await db
    .update(boardMembers)
    .set({ deletedAt: new Date(), deletedBy: args.deletedBy })
    .where(
      and(
        eq(boardMembers.boardId, args.boardId),
        eq(boardMembers.userId, args.userId),
        isNull(boardMembers.deletedAt),
      ),
    )
    .returning();
  return result;
};

export const isMember = async (
  db: dbClient,
  boardId: number,
  userId: string,
): Promise<boolean> => {
  const row = await db.query.boardMembers.findFirst({
    where: (bm, { eq: eqFn, isNull: isNullFn }) =>
      and(
        eqFn(bm.boardId, boardId),
        eqFn(bm.userId, userId),
        isNullFn(bm.deletedAt),
      ),
    columns: { id: true },
  });
  return !!row;
};

export const getByBoardId = async (db: dbClient, boardId: number) => {
  return db.query.boardMembers.findMany({
    where: (bm, { eq: eqFn, isNull: isNullFn }) =>
      and(eqFn(bm.boardId, boardId), isNullFn(bm.deletedAt)),
    columns: {
      id: true,
      publicId: true,
      userId: true,
      createdAt: true,
    },
    with: {
      user: {
        columns: {
          id: true,
          name: true,
          email: true,
          image: true,
        },
      },
    },
  });
};
