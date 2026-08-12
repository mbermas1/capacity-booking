-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Warehouse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "storeNumber" TEXT,
    "phone" TEXT,
    "contactEmail" TEXT,
    "notes" TEXT,
    "street" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "country" TEXT,
    "publicBookingSlug" TEXT NOT NULL,
    "publicPortalEnabled" BOOLEAN NOT NULL DEFAULT true,
    "carrierInstructions" TEXT,
    "amenities" TEXT NOT NULL DEFAULT '',
    "ppeRequirements" TEXT NOT NULL DEFAULT '',
    "emailSubscribers" TEXT NOT NULL DEFAULT '',
    "detentionRatePerHour" REAL,
    "detentionFreeMinutes" INTEGER,
    "accountId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Warehouse_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Warehouse" ("accountId", "active", "createdAt", "detentionFreeMinutes", "detentionRatePerHour", "id", "location", "name", "publicBookingSlug", "updatedAt") SELECT "accountId", "active", "createdAt", "detentionFreeMinutes", "detentionRatePerHour", "id", "location", "name", "publicBookingSlug", "updatedAt" FROM "Warehouse";
DROP TABLE "Warehouse";
ALTER TABLE "new_Warehouse" RENAME TO "Warehouse";
CREATE UNIQUE INDEX "Warehouse_publicBookingSlug_key" ON "Warehouse"("publicBookingSlug");
CREATE INDEX "Warehouse_accountId_idx" ON "Warehouse"("accountId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
