import { prisma } from "@/lib/prisma";
import { getPublicDockAvailability } from "@/lib/availability";
import {
  createBooking,
  DockNotFoundError,
  DockClosedError,
  MissingCarrierTagError,
  UnacceptedCommodityError,
  MinimumDurationError,
  BookingOverlapError,
} from "@/lib/bookings";
import type { LoadType } from "@/app/generated/prisma/client";

export type SubmitPublicBookingRequestInput = {
  warehouseId: string;
  dockId: string;
  startTime: Date;
  endTime: Date;
  companyName: string;
  contactEmail: string;
  contactPhone?: string;
  referenceNumber: string;
  loadType: LoadType;
};

export type SubmitPublicBookingRequestResult =
  | { outcome: "dock_not_found" }
  | { outcome: "unavailable" }
  | { outcome: "approved"; bookingRequestId: string }
  | { outcome: "pending"; bookingRequestId: string };

function describeCreateBookingError(error: unknown): string {
  if (
    error instanceof DockNotFoundError ||
    error instanceof DockClosedError ||
    error instanceof MissingCarrierTagError ||
    error instanceof UnacceptedCommodityError ||
    error instanceof MinimumDurationError ||
    error instanceof BookingOverlapError
  ) {
    return error.message;
  }
  console.error("Auto-approve attempt failed unexpectedly:", error);
  return "Internal error";
}

/**
 * Shared by the public booking-request API route and the public booking page's
 * Server Action, so the auto-approve/manual-review decision lives in one place.
 * Auto-approve attempts the real createBooking() (the same call staff approval
 * uses) so every rule — tags, commodity, buffer — still applies; a failure falls
 * back to a PENDING request with the reason recorded, never silently dropped.
 */
export async function submitPublicBookingRequest(
  input: SubmitPublicBookingRequestInput,
): Promise<SubmitPublicBookingRequestResult> {
  const dock = await prisma.dock.findUnique({
    where: { id: input.dockId },
    select: { warehouseId: true, requiresManualReview: true },
  });
  if (!dock || dock.warehouseId !== input.warehouseId) {
    return { outcome: "dock_not_found" };
  }

  const availability = await getPublicDockAvailability(input.dockId, input.startTime, input.endTime);
  if (!availability?.available) {
    return { outcome: "unavailable" };
  }

  const baseData = {
    warehouseId: input.warehouseId,
    dockId: input.dockId,
    startTime: input.startTime,
    endTime: input.endTime,
    companyName: input.companyName,
    contactEmail: input.contactEmail,
    contactPhone: input.contactPhone,
    referenceNumber: input.referenceNumber,
    loadType: input.loadType,
  };

  if (!dock.requiresManualReview) {
    try {
      const carrier = await prisma.carrier.upsert({
        where: { name: input.companyName },
        create: { name: input.companyName, email: input.contactEmail },
        update: {},
      });

      await createBooking({
        dockId: input.dockId,
        startTime: input.startTime,
        endTime: input.endTime,
        carrierId: carrier.id,
        referenceNumber: input.referenceNumber,
        loadType: input.loadType,
      });

      const bookingRequest = await prisma.bookingRequest.create({
        data: { ...baseData, status: "APPROVED", reviewNote: "Auto-approved" },
      });
      return { outcome: "approved", bookingRequestId: bookingRequest.id };
    } catch (error) {
      const reason = describeCreateBookingError(error);
      const bookingRequest = await prisma.bookingRequest.create({
        data: { ...baseData, status: "PENDING", reviewNote: `Auto-approve failed: ${reason}` },
      });
      return { outcome: "pending", bookingRequestId: bookingRequest.id };
    }
  }

  const bookingRequest = await prisma.bookingRequest.create({ data: { ...baseData, status: "PENDING" } });
  return { outcome: "pending", bookingRequestId: bookingRequest.id };
}
