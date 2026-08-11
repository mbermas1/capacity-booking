-- AlterTable
ALTER TABLE "Staff" ADD COLUMN "passwordResetToken" TEXT;
ALTER TABLE "Staff" ADD COLUMN "passwordResetExpiresAt" DATETIME;

-- AlterTable
ALTER TABLE "CarrierUser" ADD COLUMN "passwordResetToken" TEXT;
ALTER TABLE "CarrierUser" ADD COLUMN "passwordResetExpiresAt" DATETIME;

-- CreateIndex
CREATE UNIQUE INDEX "Staff_passwordResetToken_key" ON "Staff"("passwordResetToken");

-- CreateIndex
CREATE UNIQUE INDEX "CarrierUser_passwordResetToken_key" ON "CarrierUser"("passwordResetToken");
