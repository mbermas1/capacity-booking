-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Dock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "equipmentType" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "warehouseId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Dock_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Dock" ("createdAt", "equipmentType", "id", "location", "name", "updatedAt", "warehouseId") SELECT "createdAt", "equipmentType", "id", "location", "name", "updatedAt", "warehouseId" FROM "Dock";
DROP TABLE "Dock";
ALTER TABLE "new_Dock" RENAME TO "Dock";
CREATE INDEX "Dock_warehouseId_idx" ON "Dock"("warehouseId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
