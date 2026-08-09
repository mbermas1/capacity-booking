-- CreateTable
CREATE TABLE "Carrier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Booking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dockId" TEXT NOT NULL,
    "startTime" DATETIME NOT NULL,
    "endTime" DATETIME NOT NULL,
    "carrierName" TEXT NOT NULL,
    "carrierId" TEXT,
    "referenceNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "loadType" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Booking_dockId_fkey" FOREIGN KEY ("dockId") REFERENCES "Dock" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Booking_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "Carrier" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Booking" ("carrierName", "createdAt", "dockId", "endTime", "id", "loadType", "referenceNumber", "startTime", "status", "updatedAt") SELECT "carrierName", "createdAt", "dockId", "endTime", "id", "loadType", "referenceNumber", "startTime", "status", "updatedAt" FROM "Booking";
DROP TABLE "Booking";
ALTER TABLE "new_Booking" RENAME TO "Booking";
CREATE INDEX "Booking_dockId_startTime_endTime_idx" ON "Booking"("dockId", "startTime", "endTime");
CREATE INDEX "Booking_carrierId_startTime_idx" ON "Booking"("carrierId", "startTime");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Carrier_name_key" ON "Carrier"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Carrier_email_key" ON "Carrier"("email");

-- Backfill: one Carrier row per distinct existing carrierName
INSERT INTO "Carrier" ("id", "name", "createdAt", "updatedAt")
SELECT lower(hex(randomblob(16))), "carrierName", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "carrierName" FROM "Booking");

-- Backfill: point each booking at its carrier
UPDATE "Booking"
SET "carrierId" = (SELECT "id" FROM "Carrier" WHERE "Carrier"."name" = "Booking"."carrierName");
