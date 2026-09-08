-- CreateTable
CREATE TABLE "Merchant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "onboarded" BOOLEAN NOT NULL DEFAULT false,
    "delayDays" INTEGER NOT NULL DEFAULT 7,
    "eligibleProducts" TEXT NOT NULL DEFAULT '',
    "eligibleCollections" TEXT NOT NULL DEFAULT '',
    "requireWorld" BOOLEAN NOT NULL DEFAULT true,
    "autoPublish" BOOLEAN NOT NULL DEFAULT false,
    "widgetEnabled" BOOLEAN NOT NULL DEFAULT true,
    "duplicateAttempts" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchantId" TEXT NOT NULL,
    "shopifyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    CONSTRAINT "Product_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchantId" TEXT NOT NULL,
    "shopifyId" TEXT NOT NULL,
    "customerId" TEXT,
    "emailCipher" TEXT,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Order_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "fulfilledAt" DATETIME NOT NULL,
    "dueAt" DATETIME NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "sentAt" DATETIME,
    "startedAt" DATETIME,
    "consumedAt" DATETIME,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "tokenHash" TEXT,
    "tokenCipher" TEXT,
    "nonce" TEXT,
    "nonceExpiresAt" DATETIME,
    CONSTRAINT "Invitation_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Invitation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Invitation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "invitationId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "purchaser" BOOLEAN NOT NULL DEFAULT true,
    "worldVerified" BOOLEAN NOT NULL DEFAULT false,
    "mock" BOOLEAN NOT NULL DEFAULT false,
    "reply" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Review_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Review_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Review_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "Invitation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "reviewId" TEXT,
    "digest" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "verifiedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Verification_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Verification_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Verification_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PrivacyRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchantId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "customerId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PrivacyRequest_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_shop_key" ON "Merchant"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "Product_merchantId_shopifyId_key" ON "Product"("merchantId", "shopifyId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_merchantId_shopifyId_key" ON "Order"("merchantId", "shopifyId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "Invitation_dueAt_sentAt_idx" ON "Invitation"("dueAt", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_orderId_productId_key" ON "Invitation"("orderId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "Review_invitationId_key" ON "Review"("invitationId");

-- CreateIndex
CREATE INDEX "Review_merchantId_productId_status_idx" ON "Review"("merchantId", "productId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Verification_reviewId_key" ON "Verification"("reviewId");

-- CreateIndex
CREATE UNIQUE INDEX "Verification_merchantId_productId_digest_key" ON "Verification"("merchantId", "productId", "digest");

-- CreateIndex
CREATE UNIQUE INDEX "PrivacyRequest_requestId_key" ON "PrivacyRequest"("requestId");
