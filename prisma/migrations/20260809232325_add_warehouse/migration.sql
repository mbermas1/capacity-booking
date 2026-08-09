/*
  Warnings:

  - Added the required column `warehouseId` to the `Dock` table without a default value. This is not possible if the table is not empty.
  - Added the required column `warehouseId` to the `Staff` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- Seed exactly one default warehouse so existing Dock/Staff rows have somewhere to point.
INSERT INTO "Warehouse" ("id", "name", "location", "createdAt", "updatedAt")
VALUES ('default-warehouse', 'Default Warehouse', 'Unset', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Dock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "equipmentType" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Dock_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Dock" ("createdAt", "equipmentType", "id", "location", "name", "updatedAt", "warehouseId") SELECT "createdAt", "equipmentType", "id", "location", "name", "updatedAt", 'default-warehouse' FROM "Dock";
DROP TABLE "Dock";
ALTER TABLE "new_Dock" RENAME TO "Dock";
CREATE INDEX "Dock_warehouseId_idx" ON "Dock"("warehouseId");
CREATE TABLE "new_Staff" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Staff_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Staff" ("createdAt", "email", "id", "name", "passwordHash", "updatedAt", "warehouseId") SELECT "createdAt", "email", "id", "name", "passwordHash", "updatedAt", 'default-warehouse' FROM "Staff";
DROP TABLE "Staff";
ALTER TABLE "new_Staff" RENAME TO "Staff";
CREATE UNIQUE INDEX "Staff_email_key" ON "Staff"("email");
CREATE INDEX "Staff_warehouseId_idx" ON "Staff"("warehouseId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
