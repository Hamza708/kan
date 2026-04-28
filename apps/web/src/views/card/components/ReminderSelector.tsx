import { t } from "@lingui/core/macro";
import { useEffect, useRef, useState } from "react";
import { HiChevronDown } from "react-icons/hi2";

import { api } from "~/utils/api";
import { invalidateCard } from "~/utils/cardInvalidation";
import { usePopup } from "~/providers/popup";

const REMINDER_OPTIONS: { label: string; value: number | null }[] = [
  { label: t`None`, value: null },
  { label: t`1 minute before`, value: 1 },
  { label: t`5 minutes before`, value: 5 },
  { label: t`15 minutes before`, value: 15 },
  { label: t`30 minutes before`, value: 30 },
  { label: t`1 hour before`, value: 60 },
  { label: t`2 hours before`, value: 120 },
  { label: t`6 hours before`, value: 360 },
  { label: t`12 hours before`, value: 720 },
  { label: t`1 day before`, value: 1440 },
  { label: t`2 days before`, value: 2880 },
  { label: t`7 days before`, value: 10080 },
];

interface ReminderSelectorProps {
  cardPublicId: string;
  reminderField: "reminder1Minutes" | "reminder2Minutes";
  value: number | null | undefined;
  isLoading?: boolean;
  disabled?: boolean;
  hasDueDate?: boolean;
}

export function ReminderSelector({
  cardPublicId,
  reminderField,
  value,
  isLoading = false,
  disabled = false,
  hasDueDate = false,
}: ReminderSelectorProps) {
  const { showPopup } = usePopup();
  const utils = api.useUtils();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = REMINDER_OPTIONS.find((o) => o.value === (value ?? null));
  const label = selected?.label ?? t`None`;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  const updateReminder = api.card.update.useMutation({
    onError: () => {
      showPopup({
        header: t`Unable to update reminder`,
        message: t`Please try again later, or contact customer support.`,
        icon: "error",
      });
    },
    onSettled: async () => {
      await invalidateCard(utils, cardPublicId);
    },
  });

  const handleSelect = (minutes: number | null) => {
    setIsOpen(false);
    if (minutes === (value ?? null)) return;
    updateReminder.mutate({
      cardPublicId,
      [reminderField]: minutes,
    });
  };

  const isDisabled = isLoading || disabled || !hasDueDate;

  return (
    <div className="relative flex w-full items-center text-left" ref={containerRef}>
      <button
        type="button"
        onClick={() => !isDisabled && setIsOpen((v) => !v)}
        disabled={isDisabled}
        title={!hasDueDate ? t`Set a due date first` : undefined}
        className={`flex h-full w-full items-center justify-between rounded-[5px] border-[1px] border-light-50 py-1 pl-2 pr-2 text-left text-xs text-neutral-900 dark:border-dark-50 dark:text-dark-1000 ${isDisabled ? "cursor-not-allowed opacity-40" : "hover:border-light-300 hover:bg-light-200 dark:hover:border-dark-200 dark:hover:bg-dark-100"}`}
      >
        <span>{label}</span>
        <HiChevronDown size={14} className="ml-1 shrink-0 opacity-60" />
      </button>
      {isOpen && !isDisabled && (
        <div className="absolute left-0 top-full z-20 mt-1 w-48 rounded-md border border-light-200 bg-light-50 shadow-lg dark:border-dark-200 dark:bg-dark-100">
          {REMINDER_OPTIONS.map((option) => (
            <button
              key={String(option.value)}
              type="button"
              onClick={() => handleSelect(option.value)}
              className={`flex w-full items-center px-3 py-2 text-left text-xs hover:bg-light-200 dark:hover:bg-dark-200 ${option.value === (value ?? null) ? "font-semibold text-blue-500" : "text-neutral-900 dark:text-dark-1000"}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
