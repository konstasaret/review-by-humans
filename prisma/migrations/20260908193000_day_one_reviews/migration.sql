-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Merchant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "onboarded" BOOLEAN NOT NULL DEFAULT false,
    "delayDays" INTEGER NOT NULL DEFAULT 0,
    "eligibleProducts" TEXT NOT NULL DEFAULT '',
    "eligibleCollections" TEXT NOT NULL DEFAULT '',
    "requireWorld" BOOLEAN NOT NULL DEFAULT true,
    "autoPublish" BOOLEAN NOT NULL DEFAULT false,
    "widgetEnabled" BOOLEAN NOT NULL DEFAULT true,
    "duplicateAttempts" INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "new_Merchant" ("autoPublish", "delayDays", "duplicateAttempts", "eligibleCollections", "eligibleProducts", "id", "onboarded", "requireWorld", "shop", "widgetEnabled") SELECT "autoPublish", "delayDays", "duplicateAttempts", "eligibleCollections", "eligibleProducts", "id", "onboarded", "requireWorld", "shop", "widgetEnabled" FROM "Merchant";
DROP TABLE "Merchant";
ALTER TABLE "new_Merchant" RENAME TO "Merchant";
CREATE UNIQUE INDEX "Merchant_shop_key" ON "Merchant"("shop");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;


UPDATE "Merchant" SET "delayDays" = 0;
UPDATE "Invitation" SET "dueAt" = "fulfilledAt"
WHERE "consumedAt" IS NULL AND "revoked" = false AND "dueAt" > "fulfilledAt";
