import { and, count, desc, eq, isNull, lt } from "drizzle-orm";

import type { dbClient } from "@kan/db/client";
import type { NotificationType } from "@kan/db/schema";
import { boards, cards, lists, notifications, workspaces } from "@kan/db/schema";
import { generateUID } from "@kan/shared/utils";

export const create = async (
  db: dbClient,
  notificationInput: {
    type: NotificationType;
    userId: string;
    cardId?: number;
    commentId?: number;
    workspaceId?: number;
    metadata?: string;
  },
) => {
  const [result] = await db
    .insert(notifications)
    .values({
      publicId: generateUID(),
      type: notificationInput.type,
      userId: notificationInput.userId,
      cardId: notificationInput.cardId,
      commentId: notificationInput.commentId,
      workspaceId: notificationInput.workspaceId,
      metadata: notificationInput.metadata,
    })
    .returning();

  return result;
};

export const exists = async (
  db: dbClient,
  args: {
    userId: string;
    type: NotificationType;
    cardId?: number;
    workspaceId?: number;
    commentId?: number;
  },
) => {
  const result = await db.query.notifications.findFirst({
    where: (notifications, { eq, and, isNull: isNullFn }) => {
      const conditions = [
        eq(notifications.userId, args.userId),
        eq(notifications.type, args.type),
        isNullFn(notifications.deletedAt),
      ];

      if (args.cardId) {
        conditions.push(eq(notifications.cardId, args.cardId));
      }

      if (args.workspaceId) {
        conditions.push(eq(notifications.workspaceId, args.workspaceId));
      }

      // If a specific comment is provided, de-duplicate at the (user, type, comment) level
      // so that multiple mentions on the same card but different comments still create notifications.
      if (args.commentId) {
        conditions.push(eq(notifications.commentId, args.commentId));
      }

      return and(...conditions);
    },
  });

  return !!result;
};

export const markAsRead = async (
  db: dbClient,
  notificationId: number,
) => {
  const [result] = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(eq(notifications.id, notificationId))
    .returning();

  return result;
};

export const getUnreadCount = async (
  db: dbClient,
  userId: string,
) => {
  const result = await db
    .select({ count: count() })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        isNull(notifications.readAt),
        isNull(notifications.deletedAt),
      ),
    );

  return result[0]?.count ?? 0;
};

export const listByUserId = async (
  db: dbClient,
  userId: string,
  options: { limit?: number; cursor?: number } = {},
) => {
  const limit = Math.min(options.limit ?? 30, 50);

  const conditions = [
    eq(notifications.userId, userId),
    isNull(notifications.deletedAt),
  ];
  if (options.cursor != null) {
    conditions.push(lt(notifications.id, options.cursor));
  }

  const rows = await db
    .select({
      id: notifications.id,
      publicId: notifications.publicId,
      type: notifications.type,
      cardId: notifications.cardId,
      commentId: notifications.commentId,
      workspaceId: notifications.workspaceId,
      metadata: notifications.metadata,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
      cardPublicId: cards.publicId,
      cardTitle: cards.title,
      workspacePublicId: workspaces.publicId,
      workspaceName: workspaces.name,
      boardPublicId: boards.publicId,
      boardName: boards.name,
    })
    .from(notifications)
    .leftJoin(cards, eq(notifications.cardId, cards.id))
    .leftJoin(lists, eq(cards.listId, lists.id))
    .leftJoin(boards, eq(lists.boardId, boards.id))
    .leftJoin(workspaces, eq(notifications.workspaceId, workspaces.id))
    .where(and(...conditions))
    .orderBy(desc(notifications.createdAt))
    .limit(limit + 1);

  const nextCursor =
    rows.length > limit ? rows[limit - 1]?.id ?? undefined : undefined;
  const items = rows.slice(0, limit).map((row) => ({
    id: row.id,
    publicId: row.publicId,
    type: row.type,
    cardId: row.cardId,
    commentId: row.commentId,
    workspaceId: row.workspaceId,
    metadata: row.metadata,
    readAt: row.readAt,
    createdAt: row.createdAt,
    card: row.cardPublicId
      ? { publicId: row.cardPublicId, title: row.cardTitle ?? "" }
      : null,
    workspace: row.workspacePublicId
      ? { publicId: row.workspacePublicId, name: row.workspaceName ?? "" }
      : null,
    board: row.boardPublicId
      ? { publicId: row.boardPublicId, name: row.boardName ?? "" }
      : null,
  }));

  return { items, nextCursor };
};

export const deleteByUserAndType = async (
  db: dbClient,
  args: { userId: string; type: NotificationType; workspaceId?: number },
) => {
  const conditions = [
    eq(notifications.userId, args.userId),
    eq(notifications.type, args.type),
    isNull(notifications.deletedAt),
  ];
  if (args.workspaceId) {
    conditions.push(eq(notifications.workspaceId, args.workspaceId));
  }
  await db
    .update(notifications)
    .set({ deletedAt: new Date() })
    .where(and(...conditions));
};

export const markAllAsRead = async (db: dbClient, userId: string) => {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.userId, userId),
        isNull(notifications.readAt),
        isNull(notifications.deletedAt),
      ),
    );
};

export const getCardPublicIdsWithUnreadMention = async (
  db: dbClient,
  userId: string,
): Promise<string[]> => {
  const rows = await db
    .selectDistinct({ publicId: cards.publicId })
    .from(notifications)
    .innerJoin(cards, eq(notifications.cardId, cards.id))
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.type, "mention"),
        isNull(notifications.readAt),
        isNull(notifications.deletedAt),
      ),
    );
  return rows.map((r) => r.publicId);
};

export const getBoardPublicIdsWithUnreadMention = async (
  db: dbClient,
  userId: string,
): Promise<string[]> => {
  const rows = await db
    .selectDistinct({ publicId: boards.publicId })
    .from(notifications)
    .innerJoin(cards, eq(notifications.cardId, cards.id))
    .innerJoin(lists, eq(cards.listId, lists.id))
    .innerJoin(boards, eq(lists.boardId, boards.id))
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.type, "mention"),
        isNull(notifications.readAt),
        isNull(notifications.deletedAt),
      ),
    );
  return rows.map((r) => r.publicId);
};

