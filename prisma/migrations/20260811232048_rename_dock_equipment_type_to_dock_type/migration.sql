/*
  Warnings:

  - You are about to drop the column `equipmentType` on the `Dock` table. All the data in the column will be lost.
  - Added the required column `dockType` to the `Dock` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Dock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "dockType" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "minLeadTimeMinutes" INTEGER,
    "bufferMinutes" INTEGER,
    "reservedHighPrioritySlots" INTEGER,
    "requiresManualReview" BOOLEAN NOT NULL DEFAULT false,
    "warehouseId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Dock_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Dock" ("bufferMinutes", "capacity", "createdAt", "id", "location", "minLeadTimeMinutes", "name", "requiresManualReview", "reservedHighPrioritySlots", "updatedAt", "warehouseId") SELECT "bufferMinutes", "capacity", "createdAt", "id", "location", "minLeadTimeMinutes", "name", "requiresManualReview", "reservedHighPrioritySlots", "updatedAt", "warehouseId" FROM "Dock";
DROP TABLE "Dock";
ALTER TABLE "new_Dock" RENAME TO "Dock";
CREATE INDEX "Dock_warehouseId_idx" ON "Dock"("warehouseId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
