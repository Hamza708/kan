import { env } from "next-runtime-env";

import type { dbClient } from "@kan/db/client";
import * as cardRepo from "@kan/db/repository/card.repo";
import * as cardWatcherRepo from "@kan/db/repository/cardWatcher.repo";
import * as memberRepo from "@kan/db/repository/member.repo";
import * as notificationRepo from "@kan/db/repository/notification.repo";
import * as userRepo from "@kan/db/repository/user.repo";
import * as workspaceRepo from "@kan/db/repository/workspace.repo";
import { eq, or } from "drizzle-orm";
import { boards, cards, lists } from "@kan/db/schema";
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

