import { prisma } from "@/lib/prisma";
import { CARRIER_NAME_INCLUDE } from "@/lib/booking-response";
import {
  checkOperatingHours,
  findMissingCarrierTags,
  findUnacceptedCommodities,
  requiredMinDurationMinutes,
} from "@/lib/booking-constraints";
import {
  sendBookingConfirmationEmail,
  sendBookingCancellationEmail,
  sendBookingRescheduledEmail,
} from "@/lib/email";
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

export class BookingNotFoundError extends Error {
  constructor() {
    super("Booking not found");
    this.name = "BookingNotFoundError";
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

type ValidateSlotParams = {
  dockId: string;
  startTime: Date;
  endTime: Date;
  carrierId: string;
  priority: BookingPriority;
  commodityTagIds: string[];
  /** Excludes this booking's own row from the overlap/capacity count — used by reschedule. */
  excludeBookingId?: string;
};

/**
 * Shared by booking creation and rescheduling: hours, carrier-requirement tags,
 * commodity acceptance/duration, and capacity/buffer overlap. Identical to what
 * runCreateBooking always did, just extracted so reschedule can reuse it with
 * one addition — excluding the booking's own row from the overlap count.
 */
async function validateBookingSlot(tx: Prisma.TransactionClient, params: ValidateSlotParams) {
  const { dockId, startTime, endTime, carrierId, priority, commodityTagIds, excludeBookingId } = params;

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
      ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
      startTime: { lt: new Date(endTime.getTime() + bufferMs) },
      endTime: { gt: new Date(startTime.getTime() - bufferMs) },
    },
  });

  const reservedForHigh = dock.reservedHighPrioritySlots ?? 0;
  const capacityLimit =
    priority === BookingPriority.HIGH ? dock.capacity : Math.max(0, dock.capacity - reservedForHigh);

  if (overlappingCount >= capacityLimit) {
    throw new BookingOverlapError();
  }

  return { dock, declaredTags };
}

async function runCreateBooking(tx: Prisma.TransactionClient, input: CreateBookingInput) {
  const { dockId, startTime, endTime, carrierId, commodityTagIds = [] } = input;
  const effectivePriority = input.priority ?? BookingPriority.STANDARD;

  const { declaredTags } = await validateBookingSlot(tx, {
    dockId,
    startTime,
    endTime,
    carrierId,
    priority: effectivePriority,
    commodityTagIds,
  });

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

export type RescheduleBookingInput = { startTime: Date; endTime: Date };

/**
 * Moves an existing booking's time on the same dock — dock, carrier, priority,
 * and declared commodity all carry over unchanged; this isn't a general
 * booking-edit operation. Re-validates the new window against every rule
 * (hours, tags, commodity duration, capacity/buffer), excluding the booking's
 * own row from the overlap count so it doesn't conflict with itself.
 */
async function runRescheduleBooking(
  tx: Prisma.TransactionClient,
  bookingId: string,
  input: RescheduleBookingInput,
) {
  const existing = await tx.booking.findUnique({ where: { id: bookingId }, include: { tags: true } });
  if (!existing) {
    throw new BookingNotFoundError();
  }

  await validateBookingSlot(tx, {
    dockId: existing.dockId,
    startTime: input.startTime,
    endTime: input.endTime,
    carrierId: existing.carrierId,
    priority: existing.priority,
    commodityTagIds: existing.tags.map((t) => t.tagId),
    excludeBookingId: bookingId,
  });

  const booking = await tx.booking.update({
    where: { id: bookingId },
    data: { startTime: input.startTime, endTime: input.endTime },
    include: CARRIER_NAME_INCLUDE,
  });

  return { booking, previousStartTime: existing.startTime, previousEndTime: existing.endTime };
}

export async function rescheduleBooking(bookingId: string, input: RescheduleBookingInput) {
  return prisma.$transaction((tx) => runRescheduleBooking(tx, bookingId, input));
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

/**
 * Takes already-fetched data rather than a bookingId (unlike
 * notifyBookingConfirmed) — the row is gone by the time this runs, so there's
 * nothing left to look up. Pass the result of a delete() call with dock/carrier
 * included.
 */
export async function notifyBookingCancelled(booking: {
  dock: { name: string };
  carrier: { email: string | null };
  startTime: Date;
  endTime: Date;
  referenceNumber: string;
}): Promise<void> {
  if (!booking.carrier.email) return;

  await sendBookingCancellationEmail(booking.carrier.email, {
    dockName: booking.dock.name,
    startTime: booking.startTime,
    endTime: booking.endTime,
    referenceNumber: booking.referenceNumber,
  });
}

/**
 * Unlike notifyBookingCancelled, the row still exists after a reschedule
 * (it's an update, not a delete), so this looks itself up by id like
 * notifyBookingConfirmed does — just with the pre-reschedule times passed in,
 * since those are only known to the caller that just performed the update.
 */
export async function notifyBookingRescheduled(
  bookingId: string,
  previousStartTime: Date,
  previousEndTime: Date,
): Promise<void> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { dock: { select: { name: true } }, carrier: { select: { email: true } } },
  });
  if (!booking?.carrier.email) return;

  await sendBookingRescheduledEmail(booking.carrier.email, {
    dockName: booking.dock.name,
    previousStartTime,
    previousEndTime,
    newStartTime: booking.startTime,
    newEndTime: booking.endTime,
    referenceNumber: booking.referenceNumber,
  });
}
