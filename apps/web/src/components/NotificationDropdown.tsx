import Link from "next/link";
import { Menu, Transition } from "@headlessui/react";
import { t } from "@lingui/core/macro";
import { formatDistanceToNow } from "date-fns";
import { Fragment, useEffect, useRef } from "react";
import { PiBellLight } from "react-icons/pi";
import { twMerge } from "tailwind-merge";

import { useDesktopNotifications } from "~/hooks/useDesktopNotifications";
import { api } from "~/utils/api";

function playNotificationSound() {
  try {
    const ctx = new AudioContext();
    const t0 = ctx.currentTime;

    // Three-partial bell chord: fundamental + octave + fifth
    const partials: [number, number, number][] = [
      [1047, 0.25, 1.4],  // C6 fundamental
      [2093, 0.12, 1.0],  // C7 octave
      [1568, 0.08, 0.8],  // G6 fifth
    ];

    for (const [freq, amp, decay] of partials) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, t0);

      // Sharp attack, long natural exponential decay
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(amp, t0 + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);

      osc.start(t0);
      osc.stop(t0 + decay);
    }

    // Close context after longest partial finishes
    setTimeout(() => ctx.close(), 1600);
  } catch {
    // AudioContext not available (SSR or blocked)
  }
}

interface NotificationDropdownProps {
  isCollapsed?: boolean;
  onCloseSideNav?: () => void;
}

type NotificationType =
  | "mention"
  | "workspace.member.added"
  | "workspace.member.removed"
  | "workspace.role.changed"
  | "workspace.member.invited"
  | "board.member.added"
  | "card.member.added"
  | "card.activity"
  | "card.due_date.reminder";

/**
 * Uses plain template literals so messages render correctly in production (Vercel).
 * Lingui t`...` with variables can show raw placeholders like {who} when catalogs
 * aren't loaded or compiled for the build.
 */
function activityTypeToAction(activityType: string | undefined): string {
  switch (activityType) {
    case "card.updated.comment.added": return "added a comment";
    case "card.updated.comment.updated": return "updated a comment";
    case "card.updated.comment.deleted": return "deleted a comment";
    case "card.updated.label.added": return "added a label";
    case "card.updated.label.removed": return "removed a label";
    case "card.updated.member.added": return "added a member";
    case "card.updated.member.removed": return "removed a member";
    case "card.updated.title": return "updated the title";
    case "card.updated.description": return "updated the description";
    case "card.updated.dueDate.added": return "set the due date";
    case "card.updated.dueDate.updated": return "changed the due date";
    case "card.updated.dueDate.removed": return "removed the due date";
    case "card.updated.list": return "moved the card";
    case "card.updated.checklist.added": return "added a checklist";
    case "card.updated.checklist.renamed": return "renamed a checklist";
    case "card.updated.checklist.deleted": return "deleted a checklist";
    case "card.updated.checklist.item.added": return "added a checklist item";
    case "card.updated.checklist.item.updated": return "updated a checklist item";
    case "card.updated.checklist.item.completed": return "completed a checklist item";
    case "card.updated.checklist.item.uncompleted": return "uncompleted a checklist item";
    case "card.updated.checklist.item.deleted": return "deleted a checklist item";
    case "card.updated.attachment.added": return "added an attachment";
    case "card.updated.attachment.removed": return "removed an attachment";
    case "card.archived": return "archived the card";
    default: return "made a change";
  }
}

function getNotificationMessage(
  type: NotificationType,
  cardTitle?: string | null,
  workspaceName?: string | null,
  actorName?: string | null,
  metadata?: {
    boardName?: string;
    memberPublicId?: string;
    cardPublicId?: string;
    activityType?: string;
    actorName?: string;
    boardPublicId?: string;
    fromListName?: string;
    toListName?: string;
    dueDate?: string;
  } | null,
  activityType?: string | null,
  board?: { publicId: string; name: string } | null,
): string {
  switch (type) {
    case "card.member.added":
      const boardName = board?.name ?? metadata?.boardName;
      if (cardTitle)
        return `You were added to card "${cardTitle}"${
          boardName ? ` in "${boardName}"` : ""
        }`;
      if (boardName) return `You were added to a card in "${boardName}"`;
      return "You were added to a card";
    case "board.member.added":
      return metadata?.boardName
        ? `You were added to board "${metadata.boardName}"`
        : "You were added to a board";
    case "mention": {
      const who = actorName?.trim() || null;
      if (who && cardTitle) return `${who} mentioned you in "${cardTitle}"`;
      if (who) return `${who} mentioned you in a card`;
      return cardTitle
        ? `Someone mentioned you in "${cardTitle}"`
        : "Someone mentioned you in a card";
    }
    case "workspace.member.added":
      return workspaceName
        ? `You were added to workspace "${workspaceName}"`
        : "You were added to a workspace";
    case "workspace.member.removed":
      return workspaceName
        ? `You were removed from workspace "${workspaceName}"`
        : "You were removed from a workspace";
    case "workspace.role.changed":
      return "Your role was changed";
    case "workspace.member.invited":
      return workspaceName
        ? `You were invited to workspace "${workspaceName}"`
        : "You were invited to a workspace";
    case "card.activity": {
      const who = actorName?.trim() || metadata?.actorName?.trim() || "Someone";
      const currentActivityType = activityType ?? metadata?.activityType;
      const action = activityTypeToAction(currentActivityType);
      const boardName = board?.name ?? metadata?.boardName;
      const inBoard = boardName ? ` in "${boardName}"` : "";
      const fromListName = metadata?.fromListName;
      const toListName = metadata?.toListName;
      const moveDetails =
        currentActivityType === "card.updated.list" && fromListName && toListName
          ? ` from "${fromListName}" to "${toListName}"`
          : "";
      return cardTitle
        ? `${who} ${action}${moveDetails} on "${cardTitle}"${inBoard}`
        : `${who} ${action}${moveDetails} on a watched card${inBoard}`;
    }
    case "card.due_date.reminder": {
      const boardName = board?.name ?? metadata?.boardName;
      const dueDate = metadata?.dueDate
        ? new Date(metadata.dueDate).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })
        : null;
      const inBoard = boardName ? ` in "${boardName}"` : "";
      if (cardTitle && dueDate) return `"${cardTitle}" is due on ${dueDate}${inBoard}`;
      if (cardTitle) return `"${cardTitle}" is due soon${inBoard}`;
      return `A card is due soon${inBoard}`;
    }
    default:
      return "Notification";
  }
}

function getNotificationLink(
  type: NotificationType,
  cardPublicId?: string | null,
  workspacePublicId?: string | null,
  metadata?: { boardPublicId?: string; memberPublicId?: string; cardPublicId?: string } | null,
) {
  if (type === "mention" && cardPublicId) {
    return `/cards/${cardPublicId}`;
  }
  if (type === "card.member.added" && (cardPublicId ?? metadata?.cardPublicId)) {
    return `/cards/${cardPublicId ?? metadata?.cardPublicId}`;
  }
  if (type === "card.activity" && cardPublicId) {
    return `/cards/${cardPublicId}`;
  }
  if (type === "card.due_date.reminder" && cardPublicId) {
    return `/cards/${cardPublicId}`;
  }
  if (type === "board.member.added" && metadata?.boardPublicId) {
    return `/boards/${metadata.boardPublicId}`;
  }
  if (
    (type === "workspace.member.added" ||
      type === "workspace.member.removed" ||
      type === "workspace.role.changed") &&
    workspacePublicId
  ) {
    return `/boards`;
  }
  if (type === "workspace.member.invited" && metadata?.memberPublicId) {
    return `/boards?type=invite&memberPublicId=${metadata.memberPublicId}`;
  }
  return null;
}

export default function NotificationDropdown({
  isCollapsed = false,
  onCloseSideNav,
}: NotificationDropdownProps) {
  const { data: unreadCount = 0 } = api.notification.unreadCount.useQuery(
    undefined,
    { enabled: true },
  );

  const { permission, requestPermission, showNotification } = useDesktopNotifications();

  const { data: listData, isLoading: listLoading } =
    api.notification.list.useQuery({ limit: 20 }, { enabled: true });

  const items = listData?.items ?? [];

  const prevUnreadCount = useRef<number | null>(null);
  const prevItemIds = useRef<Set<number>>(new Set());

  useEffect(() => {
    const isNew =
      prevUnreadCount.current !== null && unreadCount > prevUnreadCount.current;

    if (isNew) {
      playNotificationSound();

      // Find the newest unread item to show in the desktop notification
      const newestUnread = items.find(
        (item) => !item.readAt && !prevItemIds.current.has(item.id),
      );
      if (newestUnread) {
        const metadata = newestUnread.metadata
          ? (() => {
              try {
                return JSON.parse(newestUnread.metadata) as {
                  boardPublicId?: string;
                  boardName?: string;
                  memberPublicId?: string;
                  cardPublicId?: string;
                  activityType?: string;
                  actorName?: string;
                  fromListName?: string;
                  toListName?: string;
                  dueDate?: string;
                };
              } catch {
                return null;
              }
            })()
          : null;
        const message = getNotificationMessage(
          newestUnread.type,
          newestUnread.card?.title,
          newestUnread.workspace?.name,
          newestUnread.actorName,
          metadata,
          newestUnread.activityType,
          newestUnread.board,
        );
        const link = getNotificationLink(
          newestUnread.type,
          newestUnread.card?.publicId,
          newestUnread.workspace?.publicId,
          metadata,
        );
        showNotification("WorkOS", message, link);
      }
    }

    prevUnreadCount.current = unreadCount;
    prevItemIds.current = new Set(items.map((i) => i.id));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadCount, items]);

  const utils = api.useUtils();
  const markAsReadMutation = api.notification.markAsRead.useMutation({
    onSuccess: () => {
      void utils.notification.list.invalidate();
      void utils.notification.unreadCount.invalidate();
    },
  });
  const markAllAsReadMutation = api.notification.markAllAsRead.useMutation({
    onSuccess: () => {
      void utils.notification.list.invalidate();
      void utils.notification.unreadCount.invalidate();
    },
  });

  const hasUnread = unreadCount > 0;

  return (
    <Menu as="div" className="relative inline-block text-left">
      <>
        <Menu.Button
          className={twMerge(
            "flex items-center justify-center rounded-md p-1.5 text-neutral-900 hover:bg-light-200 dark:text-dark-900 dark:hover:bg-dark-200",
            isCollapsed ? "w-full" : "w-full justify-start gap-2",
          )}
          title={t`Notifications`}
          aria-label={t`Notifications`}
        >
          <span className="relative inline-flex">
            <PiBellLight
              size={22}
              className="text-light-900 dark:text-dark-900"
              aria-hidden
            />
            {hasUnread && (
              <span
                className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-medium text-white"
                aria-label={t`${unreadCount} unread`}
              >
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </span>
          {!isCollapsed && (
            <span className="truncate text-sm">{t`Notifications`}</span>
          )}
        </Menu.Button>

        <Transition
          as={Fragment}
          enter="transition ease-out duration-100"
          enterFrom="transform opacity-0 scale-95"
          enterTo="transform opacity-100 scale-100"
          leave="transition ease-in duration-75"
          leaveFrom="transform opacity-100 scale-100"
          leaveTo="transform opacity-0 scale-95"
        >
          <Menu.Items
            className={twMerge(
              "absolute bottom-full left-0 z-10 mb-2 max-h-[min(400px,70vh)] w-80 origin-bottom-left overflow-hidden rounded-md border border-light-600 bg-light-50 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none dark:border-dark-600 dark:bg-dark-300",
            )}
          >
            <div className="flex flex-col text-neutral-900 dark:text-dark-1000">
              <div className="flex items-center justify-between border-b border-light-300 px-3 py-2 dark:border-dark-400">
                <span className="text-sm font-medium">{t`Notifications`}</span>
                <div className="flex items-center gap-2">
                  {permission === "default" && (
                    <button
                      type="button"
                      onClick={() => void requestPermission()}
                      className="text-xs text-light-700 hover:text-neutral-900 dark:text-dark-600 dark:hover:text-dark-1000 hover:underline"
                      title={t`Enable desktop notifications`}
                    >
                      {t`Enable alerts`}
                    </button>
                  )}
                  {hasUnread && (
                    <button
                      type="button"
                      onClick={() => markAllAsReadMutation.mutate()}
                      disabled={markAllAsReadMutation.isPending}
                      className="text-primary-600 dark:text-primary-400 text-xs hover:underline"
                    >
                      {t`Mark all as read`}
                    </button>
                  )}
                </div>
              </div>
              <div className="max-h-[320px] overflow-y-auto">
                {listLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="border-t-primary-500 dark:border-t-primary-400 h-6 w-6 animate-spin rounded-full border-2 border-light-400 dark:border-dark-400" />
                  </div>
                ) : items.length === 0 ? (
                  <div className="px-3 py-6 text-center text-sm text-light-700 dark:text-dark-600">
                    {t`No notifications yet`}
                  </div>
                ) : (
                  <ul className="py-1">
                    {items.map((item) => {
                      const metadata = item.metadata
                        ? (() => {
                            try {
                              return JSON.parse(item.metadata) as {
                                boardPublicId?: string;
                                boardName?: string;
                                memberPublicId?: string;
                                cardPublicId?: string;
                                activityType?: string;
                                actorName?: string;
                                fromListName?: string;
                                toListName?: string;
                              };
                            } catch {
                              return null;
                            }
                          })()
                        : null;
                      const link = getNotificationLink(
                        item.type,
                        item.card?.publicId,
                        item.workspace?.publicId,
                        metadata,
                      );
                      const message = getNotificationMessage(
                        item.type,
                        item.card?.title,
                        item.workspace?.name,
                        item.actorName,
                        metadata,
                        item.activityType,
                        item.board,
                      );
                      const isUnread = !item.readAt;

                      const isInvite = item.type === "workspace.member.invited";

                      const content = (
                        <div className="flex flex-col gap-0.5">
                          <span
                            className={twMerge(
                              "text-sm",
                              isUnread && "font-medium",
                            )}
                          >
                            {message}
                          </span>
                          <span className="text-xs text-light-600 dark:text-white">
                            {formatDistanceToNow(new Date(item.createdAt), {
                              addSuffix: true,
                            })}
                          </span>
                          {isInvite && link && (
                            <Link
                              href={link}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => {
                                if (isUnread) {
                                  markAsReadMutation.mutate({
                                    notificationId: item.id,
                                  });
                                }
                              }}
                              className="text-primary-600 dark:text-primary-400 mt-1 w-fit rounded border border-current px-2 py-0.5 text-xs font-medium hover:opacity-80"
                            >
                              {t`Join workspace`}
                            </Link>
                          )}
                        </div>
                      );

                      return (
                        <Menu.Item key={item.id}>
                          <li
                            className={twMerge(
                              "flex items-start gap-2 border-b border-light-200 px-3 py-2 last:border-b-0 dark:border-dark-400",
                              isUnread
                                ? "bg-light-200 dark:bg-dark-100/80"
                                : "bg-transparent dark:bg-dark-400/20",
                            )}
                          >
                            {link && !isInvite ? (
                              <Link
                                href={link}
                                onClick={() => {
                                  if (onCloseSideNav) onCloseSideNav();
                                  if (isUnread) {
                                    markAsReadMutation.mutate({
                                      notificationId: item.id,
                                    });
                                  }
                                }}
                                className="flex-1 text-left hover:opacity-90"
                              >
                                {content}
                              </Link>
                            ) : (
                              <div className="flex-1">{content}</div>
                            )}
                            {isUnread && link && !isInvite && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  markAsReadMutation.mutate({
                                    notificationId: item.id,
                                  });
                                }}
                                className="text-primary-600 dark:text-primary-400 shrink-0 text-xs hover:underline"
                              >
                                {t`Mark read`}
                              </button>
                            )}
                          </li>
                        </Menu.Item>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </Menu.Items>
        </Transition>
      </>
    </Menu>
  );
}
