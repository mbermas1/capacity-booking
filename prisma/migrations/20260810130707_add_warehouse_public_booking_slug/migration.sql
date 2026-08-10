/*
  Warnings:

  - Added the required column `publicBookingSlug` to the `Warehouse` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Warehouse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "publicBookingSlug" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Warehouse" ("createdAt", "id", "location", "name", "publicBookingSlug", "updatedAt") SELECT "createdAt", "id", "location", "name", lower(hex(randomblob(16))), "updatedAt" FROM "Warehouse";
DROP TABLE "Warehouse";
ALTER TABLE "new_Warehouse" RENAME TO "Warehouse";
CREATE UNIQUE INDEX "Warehouse_publicBookingSlug_key" ON "Warehouse"("publicBookingSlug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
