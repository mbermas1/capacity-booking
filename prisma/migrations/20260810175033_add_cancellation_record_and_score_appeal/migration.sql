-- CreateTable
CREATE TABLE "CancellationRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "carrierId" TEXT NOT NULL,
    "dockId" TEXT NOT NULL,
    "originalStartTime" DATETIME NOT NULL,
    "originalEndTime" DATETIME NOT NULL,
    "referenceNumber" TEXT NOT NULL,
    "cancelledAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CancellationRecord_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "Carrier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CancellationRecord_dockId_fkey" FOREIGN KEY ("dockId") REFERENCES "Dock" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScoreAppeal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "carrierId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    "resolutionNote" TEXT,
    CONSTRAINT "ScoreAppeal_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "Carrier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CancellationRecord_carrierId_idx" ON "CancellationRecord"("carrierId");

-- CreateIndex
CREATE INDEX "ScoreAppeal_carrierId_idx" ON "ScoreAppeal"("carrierId");

-- CreateIndex
CREATE INDEX "ScoreAppeal_resolvedAt_idx" ON "ScoreAppeal"("resolvedAt");
