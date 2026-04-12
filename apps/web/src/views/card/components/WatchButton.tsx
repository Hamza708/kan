import { t } from "@lingui/core/macro";
import { TbEye, TbEyeOff } from "react-icons/tb";

import { usePopup } from "~/providers/popup";
import { api } from "~/utils/api";

interface WatchButtonProps {
  cardPublicId: string;
  isWatching: boolean;
  isLoading?: boolean;
}

export function WatchButton({
  cardPublicId,
  isWatching,
  isLoading = false,
}: WatchButtonProps) {
  const utils = api.useUtils();
  const { showPopup } = usePopup();

  const toggleWatch = api.card.toggleWatch.useMutation({
    onMutate: async () => {
      await utils.card.byId.cancel({ cardPublicId });
      const previous = utils.card.byId.getData({ cardPublicId });
      utils.card.byId.setData({ cardPublicId }, (old) => {
        if (!old) return old;
        return { ...old, isWatching: !isWatching };
      });
      return { previous };
    },
    onError: (_error, _vars, context) => {
      utils.card.byId.setData({ cardPublicId }, context?.previous);
      showPopup({
        header: t`Unable to update watch status`,
        message: t`Please try again later.`,
        icon: "error",
      });
    },
    onSettled: async () => {
      await utils.card.byId.invalidate({ cardPublicId });
    },
  });

  if (isLoading) {
    return (
      <div className="h-8 w-[110px] animate-pulse rounded-[5px] bg-light-200 dark:bg-dark-200" />
    );
  }

  return (
    <button
      type="button"
      onClick={() => toggleWatch.mutate({ cardPublicId })}
      disabled={toggleWatch.isPending}
      className={`flex h-full w-full items-center gap-1.5 rounded-[5px] border-[1px] py-1 pl-2 text-left text-xs transition-colors
        ${
          isWatching
            ? "border-light-300 bg-light-200 text-neutral-900 dark:border-dark-300 dark:bg-dark-200 dark:text-dark-1000"
            : "border-light-50 text-neutral-900 hover:border-light-300 hover:bg-light-200 dark:border-dark-50 dark:text-dark-1000 dark:hover:border-dark-200 dark:hover:bg-dark-100"
        }`}
    >
      {isWatching ? <TbEye size={14} /> : <TbEyeOff size={14} />}
      {isWatching ? t`Watching` : t`Watch`}
    </button>
  );
}
