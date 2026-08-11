-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Warehouse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "publicBookingSlug" TEXT NOT NULL,
    "detentionRatePerHour" REAL,
    "detentionFreeMinutes" INTEGER,
    "accountId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Warehouse_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Warehouse" ("accountId", "createdAt", "detentionFreeMinutes", "detentionRatePerHour", "id", "location", "name", "publicBookingSlug", "updatedAt") SELECT "accountId", "createdAt", "detentionFreeMinutes", "detentionRatePerHour", "id", "location", "name", "publicBookingSlug", "updatedAt" FROM "Warehouse";
DROP TABLE "Warehouse";
ALTER TABLE "new_Warehouse" RENAME TO "Warehouse";
CREATE UNIQUE INDEX "Warehouse_publicBookingSlug_key" ON "Warehouse"("publicBookingSlug");
CREATE INDEX "Warehouse_accountId_idx" ON "Warehouse"("accountId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
