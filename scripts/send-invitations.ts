import "dotenv/config";
import db from "../app/db.server";
import { deliverDue, purgeExpired } from "../app/services/invitations.server";
try {
  await purgeExpired();
  const result = await deliverDue();
  console.log(result);
  if (result.failed) process.exitCode = 1;
} finally {
  await db.$disconnect();
}
