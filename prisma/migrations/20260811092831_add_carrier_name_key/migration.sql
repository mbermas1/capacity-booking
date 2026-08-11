/*
  Warnings:

  - Added the required column `nameKey` to the `Carrier` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Carrier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "email" TEXT,
    "partnerType" TEXT NOT NULL DEFAULT 'CARRIER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Carrier" ("createdAt", "email", "id", "name", "nameKey", "partnerType", "updatedAt") SELECT "createdAt", "email", "id", "name", lower(trim("name")), "partnerType", "updatedAt" FROM "Carrier";
DROP TABLE "Carrier";
ALTER TABLE "new_Carrier" RENAME TO "Carrier";
CREATE UNIQUE INDEX "Carrier_name_key" ON "Carrier"("name");
CREATE UNIQUE INDEX "Carrier_nameKey_key" ON "Carrier"("nameKey");
CREATE UNIQUE INDEX "Carrier_email_key" ON "Carrier"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
