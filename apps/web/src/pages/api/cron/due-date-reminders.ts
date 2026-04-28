import type { NextApiRequest, NextApiResponse } from "next";

import { sendDueDateReminders } from "@kan/api/utils/notifications";
import { createDrizzleClient } from "@kan/db/client";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${secret}`) {
      return res.status(401).json({ message: "Unauthorized" });
    }
  }

  const db = createDrizzleClient();
  await sendDueDateReminders({ db });

  return res.status(200).json({ ok: true });
}
