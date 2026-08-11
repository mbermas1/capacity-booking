/*
  Warnings:

  - Added the required column `accountId` to the `Carrier` table without a default value. This is not possible if the table is not empty.
  - Added the required column `accountId` to the `Tag` table without a default value. This is not possible if the table is not empty.
  - Added the required column `accountId` to the `Warehouse` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- Backfill: every pre-existing warehouse/carrier/tag/staff row is wrapped in one Account
-- so nothing breaks. New tenants are created explicitly by a SUPER_USER from here on.
INSERT INTO "Account" ("id", "name", "createdAt", "updatedAt")
VALUES ('default-account', 'Default Account', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Carrier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "email" TEXT,
    "partnerType" TEXT NOT NULL DEFAULT 'CARRIER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Carrier_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Carrier" ("accountId", "createdAt", "email", "id", "name", "nameKey", "partnerType", "updatedAt") SELECT 'default-account', "createdAt", "email", "id", "name", "nameKey", "partnerType", "updatedAt" FROM "Carrier";
DROP TABLE "Carrier";
ALTER TABLE "new_Carrier" RENAME TO "Carrier";
CREATE INDEX "Carrier_accountId_idx" ON "Carrier"("accountId");
CREATE UNIQUE INDEX "Carrier_accountId_name_key" ON "Carrier"("accountId", "name");
CREATE UNIQUE INDEX "Carrier_accountId_nameKey_key" ON "Carrier"("accountId", "nameKey");
CREATE UNIQUE INDEX "Carrier_accountId_email_key" ON "Carrier"("accountId", "email");
CREATE TABLE "new_Staff" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'WAREHOUSE_MANAGER',
    "accountId" TEXT,
    "warehouseId" TEXT,
    "passwordResetToken" TEXT,
    "passwordResetExpiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Staff_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Staff_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Staff" ("accountId", "createdAt", "email", "id", "name", "passwordHash", "passwordResetExpiresAt", "passwordResetToken", "role", "updatedAt", "warehouseId")
SELECT
  CASE WHEN "warehouseId" IS NOT NULL THEN 'default-account' ELSE NULL END,
  "createdAt", "email", "id", "name", "passwordHash", "passwordResetExpiresAt", "passwordResetToken",
  CASE "role" WHEN 'ADMIN' THEN 'WAREHOUSE_MANAGER' WHEN 'FACILITY_MANAGER' THEN 'DOCK_MANAGER' ELSE "role" END,
  "updatedAt", "warehouseId"
FROM "Staff";
DROP TABLE "Staff";
ALTER TABLE "new_Staff" RENAME TO "Staff";
CREATE UNIQUE INDEX "Staff_email_key" ON "Staff"("email");
CREATE UNIQUE INDEX "Staff_passwordResetToken_key" ON "Staff"("passwordResetToken");
CREATE INDEX "Staff_warehouseId_idx" ON "Staff"("warehouseId");
CREATE INDEX "Staff_accountId_idx" ON "Staff"("accountId");
CREATE TABLE "new_Tag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minDurationMinutes" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Tag_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Tag" ("accountId", "category", "createdAt", "id", "minDurationMinutes", "name", "updatedAt") SELECT 'default-account', "category", "createdAt", "id", "minDurationMinutes", "name", "updatedAt" FROM "Tag";
DROP TABLE "Tag";
ALTER TABLE "new_Tag" RENAME TO "Tag";
CREATE INDEX "Tag_accountId_idx" ON "Tag"("accountId");
CREATE UNIQUE INDEX "Tag_accountId_category_name_key" ON "Tag"("accountId", "category", "name");
CREATE TABLE "new_Warehouse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "publicBookingSlug" TEXT NOT NULL,
    "detentionRatePerHour" REAL,
    "detentionFreeMinutes" INTEGER,
    "accountId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Warehouse_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Warehouse" ("accountId", "createdAt", "detentionFreeMinutes", "detentionRatePerHour", "id", "location", "name", "publicBookingSlug", "updatedAt") SELECT 'default-account', "createdAt", "detentionFreeMinutes", "detentionRatePerHour", "id", "location", "name", "publicBookingSlug", "updatedAt" FROM "Warehouse";
DROP TABLE "Warehouse";
ALTER TABLE "new_Warehouse" RENAME TO "Warehouse";
CREATE UNIQUE INDEX "Warehouse_publicBookingSlug_key" ON "Warehouse"("publicBookingSlug");
CREATE INDEX "Warehouse_accountId_idx" ON "Warehouse"("accountId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
