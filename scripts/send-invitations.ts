import "dotenv/config";
import { setTimeout as delay } from "node:timers/promises";
import db from "../app/db.server";
import { deliverDue, purgeExpired } from "../app/services/invitations.server";
const watch = process.argv.includes("--watch");
const stop = new AbortController();
process.once("SIGINT", () => stop.abort());
process.once("SIGTERM", () => stop.abort());
try {
  do {
    await purgeExpired();
    const result = await deliverDue();
    console.log(result);
    if (!watch && result.failed) process.exitCode = 1;
    if (watch && !stop.signal.aborted)
      await delay(60000, undefined, { signal: stop.signal }).catch((error) => {
        if (error.name !== "AbortError") throw error;
      });
  } while (watch && !stop.signal.aborted);
} finally {
  await db.$disconnect();
}
