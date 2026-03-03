import Link from "next/link";
import { Menu, Transition } from "@headlessui/react";
import { t } from "@lingui/core/macro";
import { formatDistanceToNow } from "date-fns";
import { Fragment } from "react";
import { TbBell } from "react-icons/tb";
import { twMerge } from "tailwind-merge";

import { api } from "~/utils/api";

interface NotificationDropdownProps {
  isCollapsed?: boolean;
  onCloseSideNav?: () => void;
}

type NotificationType =
  | "mention"
  | "workspace.member.added"
  | "workspace.member.removed"
  | "workspace.role.changed"
  | "board.member.added";

/**
 * Uses plain template literals so messages render correctly in production (Vercel).
 * Lingui t`...` with variables can show raw placeholders like {who} when catalogs
 * aren't loaded or compiled for the build.
 */
function getNotificationMessage(
  type: NotificationType,
  cardTitle?: string | null,
  workspaceName?: string | null,
  actorName?: string | null,
  metadata?: { boardName?: string } | null,
): string {
  switch (type) {
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
    default:
      return "Notification";
  }
}

function getNotificationLink(
  type: NotificationType,
  cardPublicId?: string | null,
  workspacePublicId?: string | null,
  metadata?: { boardPublicId?: string } | null,
) {
  if (type === "mention" && cardPublicId) {
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

  const { data: listData, isLoading: listLoading } =
    api.notification.list.useQuery({ limit: 20 }, { enabled: true });

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

  const items = listData?.items ?? [];
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
            <TbBell
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
                      const metadata =
                        item.metadata && item.type === "board.member.added"
                          ? (() => {
                              try {
                                return JSON.parse(
                                  item.metadata!,
                                ) as { boardPublicId?: string; boardName?: string };
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
                      );
                      const isUnread = !item.readAt;

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
                          <span className="text-xs text-light-600 dark:text-dark-500">
                            {formatDistanceToNow(new Date(item.createdAt), {
                              addSuffix: true,
                            })}
                          </span>
                        </div>
                      );

                      return (
                        <Menu.Item key={item.id}>
                          <li
                            className={twMerge(
                              "flex items-start gap-2 border-b border-light-200 px-3 py-2 last:border-b-0 dark:border-dark-400",
                              isUnread && "bg-light-100 dark:bg-dark-200/50",
                            )}
                          >
                            {link ? (
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
                            {isUnread && link && (
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
