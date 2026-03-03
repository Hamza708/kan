import { t } from "@lingui/core/macro";
import { useRef, useState } from "react";
import { HiOutlineUserPlus, HiXMark } from "react-icons/hi2";

import Avatar from "~/components/Avatar";
import Button from "~/components/Button";
import Modal from "~/components/modal";
import { usePermissions } from "~/hooks/usePermissions";
import { useModal } from "~/providers/modal";
import { usePopup } from "~/providers/popup";
import { api } from "~/utils/api";
import { getAvatarUrl } from "~/utils/helpers";

export default function BoardMembersModal({
  boardPublicId,
  workspaceMembers,
}: {
  boardPublicId: string;
  workspaceMembers: {
    publicId: string;
    email: string;
    user: { id: string; name: string | null; email: string; image: string | null } | null;
  }[];
}) {
  const { canEditBoard } = usePermissions();
  const { closeModal } = useModal();
  const { showPopup } = usePopup();
  const [showAdd, setShowAdd] = useState(false);
  const [selectedMemberPublicId, setSelectedMemberPublicId] = useState("");
  const addSelectRef = useRef<HTMLSelectElement>(null);

  const { data: boardMembers = [], isLoading } = api.board.listMembers.useQuery(
    { boardPublicId },
    { enabled: !!boardPublicId },
  );

  const addMemberMutation = api.board.addMember.useMutation({
    onSuccess: () => {
      void api.useUtils().board.listMembers.invalidate({ boardPublicId });
      setShowAdd(false);
      setSelectedMemberPublicId("");
      showPopup({
        header: t`Member added`,
        message: t`The member has been added to this board.`,
        icon: "success",
      });
    },
    onError: (err) => {
      showPopup({
        header: t`Unable to add member`,
        message: err.message ?? t`Please try again later.`,
        icon: "error",
      });
    },
  });

  const removeMemberMutation = api.board.removeMember.useMutation({
    onSuccess: () => {
      void api.useUtils().board.listMembers.invalidate({ boardPublicId });
      showPopup({
        header: t`Member removed`,
        message: t`The member has been removed from this board.`,
        icon: "success",
      });
    },
    onError: (err) => {
      showPopup({
        header: t`Unable to remove member`,
        message: err.message ?? t`Please try again later.`,
        icon: "error",
      });
    },
  });

  const boardMemberUserIds = new Set(boardMembers.map((m) => m.userId));
  const availableToAdd = workspaceMembers.filter(
    (m) => m.user && !boardMemberUserIds.has(m.user.id),
  );

  const handleAddMember = () => {
    if (!selectedMemberPublicId) return;
    addMemberMutation.mutate({
      boardPublicId,
      memberPublicId: selectedMemberPublicId,
    });
  };

  return (
    <Modal modalSize="sm" isVisible>
      <div className="flex flex-col gap-4 p-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-light-1000 dark:text-dark-950">
            {t`Board members`}
          </h2>
          <button
            type="button"
            onClick={closeModal}
            className="rounded p-1 text-light-600 hover:bg-light-200 dark:text-dark-400 dark:hover:bg-dark-200"
            aria-label={t`Close`}
          >
            <HiXMark className="h-5 w-5" />
          </button>
        </div>

        {canEditBoard && (
          <div className="flex flex-col gap-2">
            {!showAdd ? (
              <Button
                iconLeft={
                  <HiOutlineUserPlus className="h-[18px] w-[18px]" />
                }
                onClick={() => setShowAdd(true)}
                variant="secondary"
                size="sm"
              >
                {t`Add member`}
              </Button>
            ) : (
              <div className="flex flex-col gap-2">
                <select
                  ref={addSelectRef}
                  value={selectedMemberPublicId}
                  onChange={(e) =>
                    setSelectedMemberPublicId(e.target.value)}
                  className="rounded border border-light-400 bg-light-50 px-3 py-2 text-sm dark:border-dark-400 dark:bg-dark-200"
                  aria-label={t`Select workspace member`}
                >
                  <option value="">{t`Select a member...`}</option>
                  {availableToAdd.map((m) => (
                    <option key={m.publicId} value={m.publicId}>
                      {m.user?.name ?? m.email}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleAddMember}
                    disabled={
                      !selectedMemberPublicId ||
                      addMemberMutation.isPending
                    }
                  >
                    {t`Add`}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setShowAdd(false);
                      setSelectedMemberPublicId("");
                    }}
                  >
                    {t`Cancel`}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        <ul className="max-h-64 space-y-2 overflow-y-auto">
          {isLoading ? (
            <li className="text-sm text-light-600 dark:text-dark-500">
              {t`Loading...`}
            </li>
          ) : boardMembers.length === 0 ? (
            <li className="text-sm text-light-600 dark:text-dark-500">
              {t`No members yet`}
            </li>
          ) : (
            boardMembers.map((member) => (
              <li
                key={member.id}
                className="flex items-center justify-between gap-2 rounded-md border border-light-200 py-2 pl-2 pr-2 dark:border-dark-400"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <Avatar
                    size="sm"
                    src={getAvatarUrl(member.user.image)}
                    name={member.user.name ?? member.user.email}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-light-1000 dark:text-dark-950">
                      {member.user.name ?? member.user.email}
                    </p>
                    {member.user.name && (
                      <p className="truncate text-xs text-light-600 dark:text-dark-500">
                        {member.user.email}
                      </p>
                    )}
                  </div>
                </div>
                {canEditBoard && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      removeMemberMutation.mutate({
                        boardPublicId,
                        userId: member.userId,
                      })}
                    disabled={removeMemberMutation.isPending}
                  >
                    {t`Remove`}
                  </Button>
                )}
              </li>
            ))
          )}
        </ul>
      </div>
    </Modal>
  );
}
