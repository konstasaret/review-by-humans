import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
const dir = mkdtempSync(join(tmpdir(), "wvr-test-")),
  file = join(dir, "test.sqlite");
writeFileSync(file, "");
const env = {
  ...process.env,
  DATABASE_URL: `file:${file}`,
  DATA_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
  WORLD_PROVIDER: "mock",
  WORLD_CREDENTIAL: "proof_of_human",
  WORLD_ISSUER_SCHEMA_ID: "1",
  NODE_ENV: "test",
  SHOPIFY_API_KEY: "test-key",
  SHOPIFY_API_SECRET: randomBytes(32).toString("hex"),
  SHOPIFY_APP_URL: "https://reviews.example.com",
  SCOPES: "read_products,read_orders,write_app_proxy",
};
try {
  const migration = spawnSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    { env, stdio: "inherit" },
  );
  if (migration.status !== 0) process.exitCode = 1;
  else {
    const tests = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--test",
        "--test-concurrency=1",
        "tests/policy.test.ts",
        "tests/world.test.ts",
        "tests/integration.test.ts",
      ],
      { env, stdio: "inherit" },
    );
    process.exitCode = tests.status || 0;
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
