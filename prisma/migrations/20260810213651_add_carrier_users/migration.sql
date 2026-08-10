/*
  Warnings:

  - You are about to drop the column `passwordHash` on the `Carrier` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "CarrierUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "carrierId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CarrierUser_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "Carrier" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Backfill: any Carrier with a working login (passwordHash set, which always implies email is
-- set too, since authenticateCarrier looked up by email) gets exactly one CarrierUser (role
-- ADMIN) carrying that same login forward, before the passwordHash column is dropped below.
INSERT INTO "CarrierUser" ("id", "carrierId", "name", "email", "passwordHash", "role", "createdAt", "updatedAt")
SELECT lower(hex(randomblob(16))), "id", "name", "email", "passwordHash", 'ADMIN', "createdAt", "updatedAt"
FROM "Carrier"
WHERE "passwordHash" IS NOT NULL;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Carrier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "partnerType" TEXT NOT NULL DEFAULT 'CARRIER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Carrier" ("createdAt", "email", "id", "name", "partnerType", "updatedAt") SELECT "createdAt", "email", "id", "name", "partnerType", "updatedAt" FROM "Carrier";
DROP TABLE "Carrier";
ALTER TABLE "new_Carrier" RENAME TO "Carrier";
CREATE UNIQUE INDEX "Carrier_name_key" ON "Carrier"("name");
CREATE UNIQUE INDEX "Carrier_email_key" ON "Carrier"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "CarrierUser_email_key" ON "CarrierUser"("email");

-- CreateIndex
CREATE INDEX "CarrierUser_carrierId_idx" ON "CarrierUser"("carrierId");
