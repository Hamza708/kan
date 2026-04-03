import { TRPCError } from "@trpc/server";
import { z } from "zod";

import * as notificationRepo from "@kan/db/repository/notification.repo";

import { createTRPCRouter, protectedProcedure } from "../trpc";

const notificationItemSchema = z.object({
  id: z.number(),
  publicId: z.string(),
  type: z.enum([
    "mention",
    "workspace.member.added",
    "workspace.member.removed",
    "workspace.role.changed",
    "workspace.member.invited",
    "board.member.added",
  ]),
  cardId: z.number().nullable(),
  commentId: z.number().nullable(),
  workspaceId: z.number().nullable(),
  metadata: z.string().nullable(),
  /** Set for mention type: name of the user who mentioned you */
  actorName: z.string().optional(),
  readAt: z.date().nullable(),
  createdAt: z.date(),
  card: z
    .object({
      publicId: z.string(),
      title: z.string(),
    })
    .nullable(),
  workspace: z
    .object({
      publicId: z.string(),
      name: z.string(),
    })
    .nullable(),
});

export const notificationRouter = createTRPCRouter({
  list: protectedProcedure
    .meta({
      openapi: {
        summary: "List notifications for the current user",
        method: "GET",
        path: "/notifications",
        description: "Returns paginated notifications for the authenticated user",
        tags: ["Notifications"],
        protect: true,
      },
    })
    .input(
      z.object({
        limit: z.number().min(1).max(50).optional().default(30),
        cursor: z.number().optional(),
      }),
    )
    .output(
      z.object({
        items: z.array(notificationItemSchema),
        nextCursor: z.number().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId)
        throw new TRPCError({
          message: "User not authenticated",
          code: "UNAUTHORIZED",
        });

      const result = await notificationRepo.listByUserId(ctx.db, userId, {
        limit: input.limit,
        cursor: input.cursor,
      });

      const items = result.items.map((item) => {
        let actorName: string | undefined;
        if (item.type === "mention" && item.metadata) {
          try {
            const parsed = JSON.parse(item.metadata) as { actorName?: string };
            actorName = parsed.actorName;
          } catch {
            // ignore invalid metadata
          }
        }
        return { ...item, actorName };
      });

      return { items, nextCursor: result.nextCursor };
    }),

  unreadCount: protectedProcedure
    .meta({
      openapi: {
        summary: "Get unread notification count",
        method: "GET",
        path: "/notifications/unread-count",
        description: "Returns the number of unread notifications",
        tags: ["Notifications"],
        protect: true,
      },
    })
    .input(z.void())
    .output(z.number())
    .query(async ({ ctx }) => {
      const userId = ctx.user?.id;
      if (!userId)
        throw new TRPCError({
          message: "User not authenticated",
          code: "UNAUTHORIZED",
        });

      return notificationRepo.getUnreadCount(ctx.db, userId);
    }),

  markAsRead: protectedProcedure
    .meta({
      openapi: {
        summary: "Mark a notification as read",
        method: "POST",
        path: "/notifications/{notificationId}/read",
        description: "Marks a single notification as read",
        tags: ["Notifications"],
        protect: true,
      },
    })
    .input(z.object({ notificationId: z.number() }))
    .output(z.void())
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId)
        throw new TRPCError({
          message: "User not authenticated",
          code: "UNAUTHORIZED",
        });

      const notification = await ctx.db.query.notifications.findFirst({
        where: (n, { eq }) => eq(n.id, input.notificationId),
        columns: { id: true, userId: true },
      });

      if (!notification || notification.userId !== userId) {
        throw new TRPCError({
          message: "Notification not found",
          code: "NOT_FOUND",
        });
      }

      await notificationRepo.markAsRead(ctx.db, input.notificationId);
    }),

  markAllAsRead: protectedProcedure
    .meta({
      openapi: {
        summary: "Mark all notifications as read",
        method: "POST",
        path: "/notifications/read-all",
        description: "Marks all notifications for the current user as read",
        tags: ["Notifications"],
        protect: true,
      },
    })
    .input(z.void())
    .output(z.void())
    .mutation(async ({ ctx }) => {
      const userId = ctx.user?.id;
      if (!userId)
        throw new TRPCError({
          message: "User not authenticated",
          code: "UNAUTHORIZED",
        });

      await notificationRepo.markAllAsRead(ctx.db, userId);
    }),

  getMentionedCardIds: protectedProcedure
    .meta({
      openapi: {
        summary: "Get card IDs where the current user has an unread mention",
        method: "GET",
        path: "/notifications/mentioned-cards",
        description:
          "Returns card publicIds for cards where the user was mentioned (unread)",
        tags: ["Notifications"],
        protect: true,
      },
    })
    .input(z.void())
    .output(z.array(z.string()))
    .query(async ({ ctx }) => {
      const userId = ctx.user?.id;
      if (!userId)
        throw new TRPCError({
          message: "User not authenticated",
          code: "UNAUTHORIZED",
        });

      return notificationRepo.getCardPublicIdsWithUnreadMention(ctx.db, userId);
    }),
});
