import { env } from "next-runtime-env";

import type { dbClient } from "@kan/db/client";
import * as cardRepo from "@kan/db/repository/card.repo";
import * as cardWatcherRepo from "@kan/db/repository/cardWatcher.repo";
import * as memberRepo from "@kan/db/repository/member.repo";
import * as notificationRepo from "@kan/db/repository/notification.repo";
import * as userRepo from "@kan/db/repository/user.repo";
import * as workspaceRepo from "@kan/db/repository/workspace.repo";
import { and, eq, gte, isNotNull, isNull, lte, or } from "drizzle-orm";
import { boards, cards, cardToWorkspaceMembers, cardWatchers, lists, notifications, users, workspaceMembers } from "@kan/db/schema";
import { sendEmail } from "@kan/email";
import { parseMentionsFromHTML } from "@kan/shared/utils";

/**
 * Sends mention notification emails to mentioned members
 * Only sends emails for new mentions (checks notification table to avoid duplicates)
 */
export async function sendMentionEmails({
  db,
  cardPublicId,
  commentHtml,
  commenterUserId,
  commentId,
}: {
  db: dbClient;
  cardPublicId: string;
  commentHtml: string;
  commenterUserId: string;
  commentId?: number;
}) {
  try {
    // Parse mentions from HTML
    const mentionPublicIds = parseMentionsFromHTML(commentHtml);
    if (mentionPublicIds.length === 0) return;

    // Get card with board information
    const card = await cardRepo.getWithListAndMembersByPublicId(db, cardPublicId);
    if (!card?.list.board) return;

    const board = card.list.board;
    const boardName = board.name;
    const cardTitle = card.title;
    const cardId = card.id;

    // Get workspace ID from workspace publicId
    const workspace = await workspaceRepo.getByPublicId(
      db,
      board.workspace.publicId,
    );
    if (!workspace?.id) return;

    const workspaceId = workspace.id;

    // Get commenter information
    const commenter = await userRepo.getById(db, commenterUserId);
    if (!commenter) return;

    const commenterName = commenter.name?.trim() || commenter.email;

    // Get mentioned members with full details (filtered by workspace)
    const membersWithDetails = await memberRepo.getByPublicIdsWithUsers(
      db,
      mentionPublicIds,
      workspaceId,
    );

    // Filter out the commenter
    const membersToNotify = membersWithDetails.filter(
      (member) => member.user?.id !== commenterUserId,
    );

    if (membersToNotify.length === 0) return;

    const baseUrl = env("NEXT_PUBLIC_BASE_URL");
    const cardUrl = `${baseUrl}/cards/${cardPublicId}`;

    // Send emails to all mentioned members (only if notification doesn't exist)
    await Promise.all(
      membersToNotify.map(async (member) => {
        const userId = member.user?.id;
        const email = member.user?.email ?? member.email;

        // Skip pending members (no userId) - they can be mentioned but won't receive emails
        if (!userId || !email) return;

        try {
          // Check if notification already exists for this mention.
          // We de-duplicate per (user, card, comment) so that:
          // - multiple comments on the same card each generate one notification
          // - re-editing the same comment doesn't spam duplicates.
          const notificationExists = await notificationRepo.exists(db, {
            userId,
            cardId,
            commentId,
            type: "mention",
          });

          // If notification already exists for this comment, skip sending email
          if (notificationExists) {
            return;
          }

          // Create notification record (store mentioner name for display)
          await notificationRepo.create(db, {
            type: "mention",
            userId,
            cardId,
            commentId,
            metadata: JSON.stringify({ actorName: commenterName }),
          });

          // Send email
          await sendEmail(
            email,
            `${commenterName} mentioned you in a comment on ${cardTitle}`,
            "MENTION",
            {
              commenterName,
              boardName,
              cardTitle,
              cardUrl,
            },
          );
        } catch (error) {
          console.error("Failed to send mention email:", {
            email,
            cardPublicId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }),
    );
  } catch (error) {
    console.error("Error sending mention emails:", {
      cardPublicId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Sends in-app notifications to all watchers of a card when an activity occurs.
 * The actor (user who caused the activity) is excluded from notifications.
 */
export async function sendWatchNotifications({
  db,
  cardId,
  actorUserId,
  activityType,
  fromListId,
  toListId,
}: {
  db: dbClient;
  cardId: number;
  actorUserId: string;
  activityType?: string;
  fromListId?: number;
  toListId?: number;
}) {
  try {
    const watcherUserIds = await cardWatcherRepo.getWatcherUserIds(db, cardId);
    const usersToNotify = watcherUserIds.filter((uid) => uid !== actorUserId);
    if (usersToNotify.length === 0) return;

    // Fetch actor name and board name for rich notification display
    const [actor, cardRow] = await Promise.all([
      userRepo.getById(db, actorUserId),
      db
        .select({ boardName: boards.name, boardPublicId: boards.publicId })
        .from(cards)
        .innerJoin(lists, eq(cards.listId, lists.id))
        .innerJoin(boards, eq(lists.boardId, boards.id))
        .where(eq(cards.id, cardId))
        .limit(1)
        .then((rows) => rows[0] ?? null),
    ]);

    const actorName = actor?.name?.trim() || actor?.email || undefined;
    const boardName = cardRow?.boardName ?? undefined;
    const boardPublicId = cardRow?.boardPublicId ?? undefined;
    let fromListName: string | undefined;
    let toListName: string | undefined;

    if (fromListId !== undefined && toListId !== undefined) {
      const listRows = await db
        .select({ id: lists.id, name: lists.name })
        .from(lists)
        .where(or(eq(lists.id, fromListId), eq(lists.id, toListId)));
      fromListName = listRows.find((list) => list.id === fromListId)?.name;
      toListName = listRows.find((list) => list.id === toListId)?.name;
    }

    const metadata = JSON.stringify({
      activityType,
      actorName,
      boardName,
      boardPublicId,
      fromListName,
      toListName,
    });

    await Promise.all(
      usersToNotify.map((userId) =>
        notificationRepo.create(db, {
          type: "card.activity",
          userId,
          cardId,
          metadata,
        }),
      ),
    );
  } catch (error) {
    console.error("Error sending watch notifications:", {
      cardId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Notifies card watchers and assigned members about upcoming due dates.
 *
 * Each card defines its own reminders via cards.reminder1Minutes and
 * cards.reminder2Minutes (minutes before the due date). A reminder fires
 * exactly once per (card, user, reminderIndex) — we track which one was
 * fired by storing reminderIndex in the notification's metadata.
 */
export async function sendDueDateReminders({ db }: { db: dbClient }) {
  try {
    const now = new Date();

    // Find cards with a future due date that have at least one reminder configured.
    const candidateCards = await db
      .select({
        cardId: cards.id,
        cardPublicId: cards.publicId,
        cardTitle: cards.title,
        cardDueDate: cards.dueDate,
        reminder1Minutes: cards.reminder1Minutes,
        reminder2Minutes: cards.reminder2Minutes,
        boardName: boards.name,
        boardPublicId: boards.publicId,
      })
      .from(cards)
      .innerJoin(lists, eq(cards.listId, lists.id))
      .innerJoin(boards, eq(lists.boardId, boards.id))
      .where(
        and(
          isNull(cards.deletedAt),
          isNull(lists.deletedAt),
          isNull(boards.deletedAt),
          isNotNull(cards.dueDate),
          gte(cards.dueDate, now),
          or(
            isNotNull(cards.reminder1Minutes),
            isNotNull(cards.reminder2Minutes),
          ),
        ),
      );

    if (candidateCards.length === 0) return;

    // Build the list of reminders that should fire now.
    const reminderJobs: Array<{
      card: (typeof candidateCards)[number];
      reminderIndex: 1 | 2;
    }> = [];

    for (const card of candidateCards) {
      if (!card.cardDueDate) continue;
      const due = card.cardDueDate.getTime();
      ([1, 2] as const).forEach((idx) => {
        const mins =
          idx === 1 ? card.reminder1Minutes : card.reminder2Minutes;
        if (mins == null) return;
        const fireAt = due - mins * 60 * 1000;
        if (now.getTime() >= fireAt) {
          reminderJobs.push({ card, reminderIndex: idx });
        }
      });
    }

    if (reminderJobs.length === 0) return;

    const baseUrl = env("NEXT_PUBLIC_BASE_URL");

    await Promise.all(
      reminderJobs.map(async (job) => {
        const { card, reminderIndex } = job;

        // Recipients: watchers ∪ assigned members.
        const [watcherRows, memberRows] = await Promise.all([
          db
            .select({ userId: cardWatchers.userId, userEmail: users.email })
            .from(cardWatchers)
            .innerJoin(users, eq(cardWatchers.userId, users.id))
            .where(eq(cardWatchers.cardId, card.cardId)),

          db
            .select({ userId: workspaceMembers.userId, userEmail: users.email })
            .from(cardToWorkspaceMembers)
            .innerJoin(
              workspaceMembers,
              eq(cardToWorkspaceMembers.workspaceMemberId, workspaceMembers.id),
            )
            .innerJoin(users, eq(workspaceMembers.userId, users.id))
            .where(
              and(
                eq(cardToWorkspaceMembers.cardId, card.cardId),
                isNull(workspaceMembers.deletedAt),
              ),
            ),
        ]);

        const seen = new Set<string>();
        const recipients = [...watcherRows, ...memberRows].filter((r) => {
          if (!r.userId) return false;
          if (seen.has(r.userId)) return false;
          seen.add(r.userId);
          return true;
        }) as Array<{ userId: string; userEmail: string | null }>;

        const formattedDueDate = card.cardDueDate
          ? new Date(card.cardDueDate).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })
          : "";

        await Promise.all(
          recipients.map(async (recipient) => {
            try {
              // Has THIS reminder (by index) already fired for this user+card?
              const existing = await db.query.notifications.findMany({
                where: (n, { and: a, eq: e, isNull: nil }) =>
                  a(
                    e(n.userId, recipient.userId),
                    e(n.type, "card.due_date.reminder"),
                    e(n.cardId, card.cardId),
                    nil(n.deletedAt),
                  ),
                columns: { metadata: true },
              });

              const alreadyFired = existing.some((n) => {
                if (!n.metadata) return false;
                try {
                  const meta = JSON.parse(n.metadata) as {
                    reminderIndex?: number;
                  };
                  return meta.reminderIndex === reminderIndex;
                } catch {
                  return false;
                }
              });

              if (alreadyFired) return;

              await notificationRepo.create(db, {
                type: "card.due_date.reminder",
                userId: recipient.userId,
                cardId: card.cardId,
                metadata: JSON.stringify({
                  dueDate: card.cardDueDate,
                  boardName: card.boardName,
                  boardPublicId: card.boardPublicId,
                  reminderIndex,
                }),
              });

              if (recipient.userEmail) {
                await sendEmail(
                  recipient.userEmail,
                  `Reminder: "${card.cardTitle}" is due on ${formattedDueDate}`,
                  "DUE_DATE_REMINDER",
                  {
                    cardTitle: card.cardTitle,
                    boardName: card.boardName,
                    dueDate: formattedDueDate,
                    cardUrl: `${baseUrl}/cards/${card.cardPublicId}`,
                  },
                );
              }
            } catch (error) {
              console.error("Failed to send due date reminder:", {
                cardPublicId: card.cardPublicId,
                userId: recipient.userId,
                reminderIndex,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }),
        );
      }),
    );
  } catch (error) {
    console.error("Error running due date reminders:", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

