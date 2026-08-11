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
    "priority" TEXT NOT NULL DEFAULT 'STANDARD',
    "shipmentVolume" INTEGER,
    "checkedInAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdByStaffId" TEXT,
    "createdByCarrierUserId" TEXT,
    "checkedInByStaffId" TEXT,
    "completedByStaffId" TEXT,
    CONSTRAINT "Booking_dockId_fkey" FOREIGN KEY ("dockId") REFERENCES "Dock" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Booking_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "Carrier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Booking_createdByStaffId_fkey" FOREIGN KEY ("createdByStaffId") REFERENCES "Staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Booking_createdByCarrierUserId_fkey" FOREIGN KEY ("createdByCarrierUserId") REFERENCES "CarrierUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Booking_checkedInByStaffId_fkey" FOREIGN KEY ("checkedInByStaffId") REFERENCES "Staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Booking_completedByStaffId_fkey" FOREIGN KEY ("completedByStaffId") REFERENCES "Staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Booking" ("carrierId", "checkedInAt", "completedAt", "createdAt", "dockId", "endTime", "id", "loadType", "priority", "referenceNumber", "shipmentVolume", "startTime", "status", "updatedAt") SELECT "carrierId", "checkedInAt", "completedAt", "createdAt", "dockId", "endTime", "id", "loadType", "priority", "referenceNumber", "shipmentVolume", "startTime", "status", "updatedAt" FROM "Booking";
DROP TABLE "Booking";
ALTER TABLE "new_Booking" RENAME TO "Booking";
CREATE INDEX "Booking_dockId_startTime_endTime_idx" ON "Booking"("dockId", "startTime", "endTime");
CREATE INDEX "Booking_carrierId_startTime_idx" ON "Booking"("carrierId", "startTime");
CREATE TABLE "new_CancellationRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "carrierId" TEXT NOT NULL,
    "dockId" TEXT NOT NULL,
    "originalStartTime" DATETIME NOT NULL,
    "originalEndTime" DATETIME NOT NULL,
    "referenceNumber" TEXT NOT NULL,
    "cancelledAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledByStaffId" TEXT,
    "cancelledByCarrierUserId" TEXT,
    CONSTRAINT "CancellationRecord_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "Carrier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CancellationRecord_dockId_fkey" FOREIGN KEY ("dockId") REFERENCES "Dock" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CancellationRecord_cancelledByStaffId_fkey" FOREIGN KEY ("cancelledByStaffId") REFERENCES "Staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CancellationRecord_cancelledByCarrierUserId_fkey" FOREIGN KEY ("cancelledByCarrierUserId") REFERENCES "CarrierUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_CancellationRecord" ("cancelledAt", "carrierId", "dockId", "id", "originalEndTime", "originalStartTime", "referenceNumber") SELECT "cancelledAt", "carrierId", "dockId", "id", "originalEndTime", "originalStartTime", "referenceNumber" FROM "CancellationRecord";
DROP TABLE "CancellationRecord";
ALTER TABLE "new_CancellationRecord" RENAME TO "CancellationRecord";
CREATE INDEX "CancellationRecord_carrierId_idx" ON "CancellationRecord"("carrierId");
CREATE TABLE "new_ScoreAppeal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "carrierId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    "resolutionNote" TEXT,
    "createdByCarrierUserId" TEXT,
    "resolvedByStaffId" TEXT,
    CONSTRAINT "ScoreAppeal_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "Carrier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ScoreAppeal_createdByCarrierUserId_fkey" FOREIGN KEY ("createdByCarrierUserId") REFERENCES "CarrierUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ScoreAppeal_resolvedByStaffId_fkey" FOREIGN KEY ("resolvedByStaffId") REFERENCES "Staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ScoreAppeal" ("carrierId", "createdAt", "id", "note", "resolutionNote", "resolvedAt") SELECT "carrierId", "createdAt", "id", "note", "resolutionNote", "resolvedAt" FROM "ScoreAppeal";
DROP TABLE "ScoreAppeal";
ALTER TABLE "new_ScoreAppeal" RENAME TO "ScoreAppeal";
CREATE INDEX "ScoreAppeal_carrierId_idx" ON "ScoreAppeal"("carrierId");
CREATE INDEX "ScoreAppeal_resolvedAt_idx" ON "ScoreAppeal"("resolvedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
