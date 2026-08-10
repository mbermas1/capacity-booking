import { prisma } from "@/lib/prisma";
import { CARRIER_NAME_INCLUDE } from "@/lib/booking-response";
import {
  checkOperatingHours,
  findMissingCarrierTags,
  findUnacceptedCommodities,
  requiredMinDurationMinutes,
} from "@/lib/booking-constraints";
import { sendBookingConfirmationEmail } from "@/lib/email";
import { BookingPriority } from "@/app/generated/prisma/client";
import type {
  BookingStatus,
  LoadType,
  Prisma,
} from "@/app/generated/prisma/client";

export class BookingOverlapError extends Error {
  constructor() {
    super("Booking overlaps an existing slot for this dock");
    this.name = "BookingOverlapError";
  }
}

export class DockNotFoundError extends Error {
  constructor() {
    super("Dock not found");
    this.name = "DockNotFoundError";
  }
}

export class DockClosedError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "DockClosedError";
  }
}

export class MissingCarrierTagError extends Error {
  constructor(public missingTagNames: string[]) {
    super(`Carrier is missing required tag(s): ${missingTagNames.join(", ")}`);
    this.name = "MissingCarrierTagError";
  }
}

export class UnacceptedCommodityError extends Error {
  constructor(public tagNames: string[]) {
    super(`Dock does not accept commodity tag(s): ${tagNames.join(", ")}`);
    this.name = "UnacceptedCommodityError";
  }
}

export class MinimumDurationError extends Error {
  constructor(public requiredMinutes: number) {
    super(`Booking must be at least ${requiredMinutes} minutes long for the declared commodity`);
    this.name = "MinimumDurationError";
  }
}

/** Portal bookings only — not thrown by runCreateBooking, see checkLeadTime call sites. */
export class LeadTimeError extends Error {
  constructor(public requiredMinutes: number) {
    super(`Booking must be made at least ${requiredMinutes} minutes before the requested start time`);
    this.name = "LeadTimeError";
  }
}

export type CreateBookingInput = {
  dockId: string;
  startTime: Date;
  endTime: Date;
  carrierId: string;
  referenceNumber: string;
  loadType: LoadType;
  status?: BookingStatus;
  priority?: BookingPriority;
  shipmentVolume?: number;
  /** Optional commodity tag ids declared for this booking (COMMODITY category only). */
  commodityTagIds?: string[];
};

async function runCreateBooking(tx: Prisma.TransactionClient, input: CreateBookingInput) {
  const { dockId, startTime, endTime, carrierId, commodityTagIds = [] } = input;

  if (endTime <= startTime) {
    throw new Error("endTime must be after startTime");
  }

  const dock = await tx.dock.findUnique({
    where: { id: dockId },
    include: { operatingHours: true, tags: { include: { tag: true } } },
  });

  if (!dock) {
    throw new DockNotFoundError();
  }

  const hoursViolation = checkOperatingHours(dock.operatingHours, startTime, endTime);
  if (hoursViolation) {
    throw new DockClosedError(hoursViolation);
  }

  const carrierTags = await tx.carrierTag.findMany({ where: { carrierId }, select: { tagId: true } });
  const missingCarrierTags = findMissingCarrierTags(dock.tags, new Set(carrierTags.map((t) => t.tagId)));
  if (missingCarrierTags.length > 0) {
    throw new MissingCarrierTagError(missingCarrierTags);
  }

  let declaredTags: { id: string; name: string; minDurationMinutes: number | null }[] = [];
  if (commodityTagIds.length > 0) {
    declaredTags = await tx.tag.findMany({ where: { id: { in: commodityTagIds }, category: "COMMODITY" } });

    const unaccepted = findUnacceptedCommodities(dock.tags, declaredTags);
    if (unaccepted.length > 0) {
      throw new UnacceptedCommodityError(unaccepted);
    }
  }

  const requiredMinutes = requiredMinDurationMinutes(declaredTags);
  if (requiredMinutes > 0) {
    const durationMinutes = (endTime.getTime() - startTime.getTime()) / 60000;
    if (durationMinutes < requiredMinutes) {
      throw new MinimumDurationError(requiredMinutes);
    }
  }

  const bufferMs = (dock.bufferMinutes ?? 0) * 60000;
  const overlappingCount = await tx.booking.count({
    where: {
      dockId,
      startTime: { lt: new Date(endTime.getTime() + bufferMs) },
      endTime: { gt: new Date(startTime.getTime() - bufferMs) },
    },
  });

  const effectivePriority = input.priority ?? BookingPriority.STANDARD;
  const reservedForHigh = dock.reservedHighPrioritySlots ?? 0;
  const capacityLimit =
    effectivePriority === BookingPriority.HIGH ? dock.capacity : Math.max(0, dock.capacity - reservedForHigh);

  if (overlappingCount >= capacityLimit) {
    throw new BookingOverlapError();
  }

  return tx.booking.create({
    data: {
      dockId,
      startTime,
      endTime,
      carrierId,
      referenceNumber: input.referenceNumber,
      loadType: input.loadType,
      status: input.status,
      priority: input.priority,
      shipmentVolume: input.shipmentVolume,
      tags: declaredTags.length > 0 ? { create: declaredTags.map((t) => ({ tagId: t.id })) } : undefined,
    },
    include: CARRIER_NAME_INCLUDE,
  });
}

export async function createBooking(input: CreateBookingInput) {
  return prisma.$transaction((tx) => runCreateBooking(tx, input));
}

/**
 * Same checks and creation as createBooking, but runs inside a transaction the
 * caller already opened — used by bulk import, which needs one transaction
 * spanning the whole batch rather than one per booking.
 */
export async function createBookingWithTx(tx: Prisma.TransactionClient, input: CreateBookingInput) {
  return runCreateBooking(tx, input);
}

/**
 * Deliberately NOT called from within createBooking/runCreateBooking — that
 * would also fire for public-request-flow bookings (auto-approve and staff
 * approval both call createBooking too), which are explicitly out of scope
 * here. Call sites opt in individually after a successful createBooking().
 */
export async function notifyBookingConfirmed(bookingId: string): Promise<void> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { dock: { select: { name: true } }, carrier: { select: { email: true } } },
  });
  if (!booking?.carrier.email) return;

  await sendBookingConfirmationEmail(booking.carrier.email, {
    dockName: booking.dock.name,
    startTime: booking.startTime,
    endTime: booking.endTime,
    referenceNumber: booking.referenceNumber,
  });
}
