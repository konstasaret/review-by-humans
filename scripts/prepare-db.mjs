import "dotenv/config";
import { openSync, closeSync, mkdirSync } from "node:fs";
import { resolve, dirname, isAbsolute } from "node:path";
const url = process.env.DATABASE_URL;
if (!url?.startsWith("file:"))
  throw new Error("The MVP expects a SQLite file DATABASE_URL");
const filename = url.slice(5),
  path = isAbsolute(filename) ? filename : resolve("prisma", filename);
mkdirSync(dirname(path), { recursive: true });
closeSync(openSync(path, "a", 0o600));
