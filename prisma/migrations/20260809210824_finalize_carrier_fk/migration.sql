/*
  Warnings:

  - You are about to drop the column `carrierName` on the `Booking` table. All the data in the column will be lost.
  - Made the column `carrierId` on table `Booking` required. This step will fail if there are existing NULL values in that column.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Booking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dockId" TEXT NOT NULL,
    "startTime" DATETIME NOT NULL,
    "endTime" DATETIME NOT NULL,
    "carrierId" TEXT NOT NULL,
    "referenceNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "loadType" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Booking_dockId_fkey" FOREIGN KEY ("dockId") REFERENCES "Dock" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Booking_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "Carrier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Booking" ("carrierId", "createdAt", "dockId", "endTime", "id", "loadType", "referenceNumber", "startTime", "status", "updatedAt") SELECT "carrierId", "createdAt", "dockId", "endTime", "id", "loadType", "referenceNumber", "startTime", "status", "updatedAt" FROM "Booking";
DROP TABLE "Booking";
ALTER TABLE "new_Booking" RENAME TO "Booking";
CREATE INDEX "Booking_dockId_startTime_endTime_idx" ON "Booking"("dockId", "startTime", "endTime");
CREATE INDEX "Booking_carrierId_startTime_idx" ON "Booking"("carrierId", "startTime");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
