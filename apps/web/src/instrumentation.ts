function parseIntervalMs(value: string | undefined, defaultMs: number): number {
  if (!value) return defaultMs;
  const match = /^(\d+)(m|h|d)$/.exec(value.trim().toLowerCase());
  if (!match) return defaultMs;
  const n = parseInt(match[1]!, 10);
  const unit = match[2];
  if (unit === "m") return n * 60 * 1000;
  if (unit === "h") return n * 60 * 60 * 1000;
  return n * 24 * 60 * 60 * 1000;
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Explicitly load .env in local dev so REMINDER_INTERVAL is available
  if (process.env.NODE_ENV !== "production") {
    const { config } = await import("dotenv");
    config({ path: `${process.cwd()}/.env`, override: false });
  }

  const intervalMs = parseIntervalMs(
    process.env.REMINDER_INTERVAL,
    12 * 60 * 60 * 1000,
  );

  const { sendDueDateReminders } = await import(
    "@kan/api/utils/notifications"
  );
  const { createDrizzleClient } = await import("@kan/db/client");

  const db = createDrizzleClient();

  console.log(`[reminders] scheduler started, interval=${intervalMs}ms`);

  const run = async () => {
    console.log("[reminders] running due date reminder job...");
    try {
      await sendDueDateReminders({ db });
      console.log("[reminders] job completed");
    } catch (error) {
      console.error("[reminders] job failed:", error);
    }
  };

  await run();
  setInterval(run, intervalMs);
}
