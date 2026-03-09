import { and, eq, inArray, isNull } from "drizzle-orm";

import type { dbClient } from "@kan/db/client";
import { boardMembers, boards, workspaceMembers } from "@kan/db/schema";
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

/**
 * Returns workspace members who are on the given board (for @ mentions in comments).
 * Same shape as workspace.members so it can be used in the Editor mention dropdown.
 */
export const getWorkspaceMembersByBoardId = async (
  db: dbClient,
  boardId: number,
) => {
  const board = await db.query.boards.findFirst({
    columns: { workspaceId: true },
    where: (b, { eq: eqFn }) => eqFn(b.id, boardId),
  });
  if (!board) return [];

  const bmRows = await db
    .select({ userId: boardMembers.userId })
    .from(boardMembers)
    .where(
      and(
        eq(boardMembers.boardId, boardId),
        isNull(boardMembers.deletedAt),
      ),
    );
  const userIds = bmRows.map((r) => r.userId).filter((id): id is string => !!id);
  if (userIds.length === 0) return [];

  return db.query.workspaceMembers.findMany({
    columns: {
      publicId: true,
      email: true,
      status: true,
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
    where: (wm, { eq: eqFn, inArray: inArrayFn, isNull: isNullFn }) =>
      and(
        eqFn(wm.workspaceId, board.workspaceId),
        inArrayFn(wm.userId, userIds),
        eqFn(wm.status, "active"),
        isNullFn(wm.deletedAt),
      ),
  });
};
