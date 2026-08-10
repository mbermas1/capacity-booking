-- AlterTable
ALTER TABLE "BookingRequest" ADD COLUMN "verificationToken" TEXT;
ALTER TABLE "BookingRequest" ADD COLUMN "verificationExpiresAt" DATETIME;
ALTER TABLE "BookingRequest" ADD COLUMN "verifiedAt" DATETIME;

-- CreateIndex
CREATE UNIQUE INDEX "BookingRequest_verificationToken_key" ON "BookingRequest"("verificationToken");
