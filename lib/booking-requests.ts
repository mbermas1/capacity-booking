import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getPublicDockAvailability } from "@/lib/availability";
import { findOrCreateCarrierByName } from "@/lib/carrier-identity";
import { sendVerificationEmail } from "@/lib/email";
import {
  createBooking,
  DockNotFoundError,
  DockClosedError,
  MissingCarrierTagError,
  UnacceptedCommodityError,
  MinimumDurationError,
  BookingOverlapError,
  LaborCapacityError,
  YardCapacityError,
  WarehouseInactiveError,
} from "@/lib/bookings";
import type { LoadType } from "@/app/generated/prisma/client";

const VERIFICATION_TTL_MS = 30 * 60 * 1000;

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
  verifyBaseUrl: string; // e.g. "https://example.com" — used to build the emailed link
};

export type SubmitPublicBookingRequestResult =
  | { outcome: "dock_not_found" }
  | { outcome: "unavailable" }
  | { outcome: "awaiting_verification"; bookingRequestId: string };

export type VerifyBookingRequestResult =
  | { outcome: "not_found" }
  | { outcome: "expired"; slug: string }
  | { outcome: "unavailable"; slug: string }
  | { outcome: "approved"; slug: string }
  | { outcome: "pending"; slug: string };

function describeCreateBookingError(error: unknown): string {
  if (
    error instanceof DockNotFoundError ||
    error instanceof DockClosedError ||
    error instanceof MissingCarrierTagError ||
    error instanceof UnacceptedCommodityError ||
    error instanceof MinimumDurationError ||
    error instanceof BookingOverlapError ||
    error instanceof LaborCapacityError ||
    error instanceof YardCapacityError ||
    error instanceof WarehouseInactiveError
  ) {
    return error.message;
  }
  console.error("Auto-approve attempt failed unexpectedly:", error);
  return "Internal error";
}

/**
 * Shared by the public booking-request API route and the public booking page's
 * Server Action. Validates the request and creates it PENDING with a
 * verification token/email — the auto-approve/manual-review decision is
 * deferred to verifyBookingRequestEmail, triggered by the emailed link.
 */
export async function submitPublicBookingRequest(
  input: SubmitPublicBookingRequestInput,
): Promise<SubmitPublicBookingRequestResult> {
  const dock = await prisma.dock.findUnique({
    where: { id: input.dockId },
    select: { warehouseId: true, name: true },
  });
  if (!dock || dock.warehouseId !== input.warehouseId) {
    return { outcome: "dock_not_found" };
  }

  const availability = await getPublicDockAvailability(input.dockId, input.startTime, input.endTime);
  if (!availability?.available) {
    return { outcome: "unavailable" };
  }

  const warehouse = await prisma.warehouse.findUnique({
    where: { id: input.warehouseId },
    select: { publicBookingSlug: true },
  });
  if (!warehouse) {
    return { outcome: "dock_not_found" };
  }

  const verificationToken = randomBytes(16).toString("hex");
  const verificationExpiresAt = new Date(Date.now() + VERIFICATION_TTL_MS);

  const bookingRequest = await prisma.bookingRequest.create({
    data: {
      warehouseId: input.warehouseId,
      dockId: input.dockId,
      startTime: input.startTime,
      endTime: input.endTime,
      companyName: input.companyName,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,
      referenceNumber: input.referenceNumber,
      loadType: input.loadType,
      status: "PENDING",
      verificationToken,
      verificationExpiresAt,
    },
  });

  const verifyUrl = `${input.verifyBaseUrl}/book/${warehouse.publicBookingSlug}/verify?token=${verificationToken}`;
  const sent = await sendVerificationEmail(input.contactEmail, verifyUrl, { dockName: dock.name });
  if (!sent) {
    await prisma.bookingRequest.update({
      where: { id: bookingRequest.id },
      data: { reviewNote: "Verification email failed to send" },
    });
  }

  return { outcome: "awaiting_verification", bookingRequestId: bookingRequest.id };
}

/**
 * Triggered by the emailed verification link. Only past this point does the
 * auto-approve-or-fall-back-to-manual-review decision happen — staff can still
 * approve/reject an unverified request directly at any time (unaffected by this).
 */
export async function verifyBookingRequestEmail(token: string): Promise<VerifyBookingRequestResult> {
  const bookingRequest = await prisma.bookingRequest.findUnique({
    where: { verificationToken: token },
    include: { dock: true, warehouse: { select: { publicBookingSlug: true, accountId: true } } },
  });
  if (!bookingRequest) {
    return { outcome: "not_found" };
  }

  const slug = bookingRequest.warehouse.publicBookingSlug;

  if (bookingRequest.verifiedAt) {
    return bookingRequest.status === "APPROVED" ? { outcome: "approved", slug } : { outcome: "pending", slug };
  }

  if (bookingRequest.verificationExpiresAt && bookingRequest.verificationExpiresAt < new Date()) {
    return { outcome: "expired", slug };
  }

  await prisma.bookingRequest.update({ where: { id: bookingRequest.id }, data: { verifiedAt: new Date() } });

  const availability = await getPublicDockAvailability(
    bookingRequest.dockId,
    bookingRequest.startTime,
    bookingRequest.endTime,
  );
  if (!availability?.available) {
    await prisma.bookingRequest.update({
      where: { id: bookingRequest.id },
      data: { status: "REJECTED", reviewNote: "Slot no longer available by the time email was verified" },
    });
    return { outcome: "unavailable", slug };
  }

  if (!bookingRequest.dock.requiresManualReview) {
    try {
      const carrier = await findOrCreateCarrierByName(prisma, bookingRequest.warehouse.accountId, bookingRequest.companyName, {
        email: bookingRequest.contactEmail,
      });

      await createBooking({
        dockId: bookingRequest.dockId,
        startTime: bookingRequest.startTime,
        endTime: bookingRequest.endTime,
        carrierId: carrier.id,
        referenceNumber: bookingRequest.referenceNumber,
        loadType: bookingRequest.loadType,
      });

      await prisma.bookingRequest.update({
        where: { id: bookingRequest.id },
        data: { status: "APPROVED", reviewNote: "Auto-approved" },
      });
      return { outcome: "approved", slug };
    } catch (error) {
      const reason = describeCreateBookingError(error);
      await prisma.bookingRequest.update({
        where: { id: bookingRequest.id },
        data: { reviewNote: `Auto-approve failed: ${reason}` },
      });
      return { outcome: "pending", slug };
    }
  }

  return { outcome: "pending", slug };
}
