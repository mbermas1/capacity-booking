import { prisma } from "@/lib/prisma";
import { CARRIER_NAME_INCLUDE } from "@/lib/booking-response";
import {
  checkOperatingHours,
  findMissingCarrierTags,
  findUnacceptedCommodities,
  requiredMinDurationMinutes,
  activeLaborHeadcount,
} from "@/lib/booking-constraints";
import {
  sendBookingConfirmationEmail,
  sendBookingCancellationEmail,
  sendBookingRescheduledEmail,
  sendBookingNoShowEmail,
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

export class InvalidStatusTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidStatusTransitionError";
  }
}

export class DockClosedError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "DockClosedError";
  }
}

export class WarehouseInactiveError extends Error {
  constructor() {
    super("This warehouse is not currently accepting bookings");
    this.name = "WarehouseInactiveError";
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

export class LaborCapacityError extends Error {
  constructor(public availableHeadcount: number) {
    super(`No scheduled labor available for this window (${availableHeadcount} worker${availableHeadcount === 1 ? "" : "s"} scheduled)`);
    this.name = "LaborCapacityError";
  }
}

export class YardCapacityError extends Error {
  constructor(public trailerSlots: number) {
    super(`Yard is at capacity for this window (${trailerSlots} trailer slot${trailerSlots === 1 ? "" : "s"} available)`);
    this.name = "YardCapacityError";
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

/** Who performed a booking-lifecycle action — omitted for system/API callers with no session. */
export type BookingActor = { staffId: string } | { carrierUserId: string };

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
    include: { operatingHours: true, tags: { include: { tag: true } }, warehouse: { select: { active: true } } },
  });

  if (!dock) {
    throw new DockNotFoundError();
  }

  if (!dock.warehouse.active) {
    throw new WarehouseInactiveError();
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

  const [yardCapacity, laborShifts] = await Promise.all([
    tx.yardCapacity.findUnique({ where: { warehouseId: dock.warehouseId } }),
    tx.laborShift.findMany({ where: { warehouseId: dock.warehouseId } }),
  ]);
  const laborHeadcount = activeLaborHeadcount(laborShifts, startTime);

  if (yardCapacity || laborHeadcount !== null) {
    const warehouseOverlap = await tx.booking.count({
      where: {
        dock: { warehouseId: dock.warehouseId },
        ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
    });

    if (yardCapacity && warehouseOverlap >= yardCapacity.trailerSlots) {
      throw new YardCapacityError(yardCapacity.trailerSlots);
    }
    if (laborHeadcount !== null && warehouseOverlap >= laborHeadcount) {
      throw new LaborCapacityError(laborHeadcount);
    }
  }

  return { dock, declaredTags };
}

async function runCreateBooking(tx: Prisma.TransactionClient, input: CreateBookingInput, actor?: BookingActor) {
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
      createdByStaffId: actor && "staffId" in actor ? actor.staffId : undefined,
      createdByCarrierUserId: actor && "carrierUserId" in actor ? actor.carrierUserId : undefined,
    },
    include: CARRIER_NAME_INCLUDE,
  });
}

export async function createBooking(input: CreateBookingInput, actor?: BookingActor) {
  return prisma.$transaction((tx) => runCreateBooking(tx, input, actor));
}

/**
 * Same checks and creation as createBooking, but runs inside a transaction the
 * caller already opened — used by bulk import, which needs one transaction
 * spanning the whole batch rather than one per booking.
 */
export async function createBookingWithTx(tx: Prisma.TransactionClient, input: CreateBookingInput, actor?: BookingActor) {
  return runCreateBooking(tx, input, actor);
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
 * Staff-witnessed physical arrival, not a self-service driver action (see
 * project_notification_pattern / the no-show scoring discussion for why a
 * self-reported check-in would undermine it as a trust-score input later).
 * No notification: unlike confirm/cancel/reschedule/no-show, the carrier's
 * own driver is physically present for this event.
 */
export async function checkInBooking(bookingId: string, actor?: { staffId: string }) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.booking.findUnique({ where: { id: bookingId } });
    if (!existing) {
      throw new BookingNotFoundError();
    }
    if (existing.status !== "SCHEDULED") {
      throw new InvalidStatusTransitionError(
        `Booking is ${existing.status.replace("_", " ").toLowerCase()}, not scheduled`,
      );
    }

    return tx.booking.update({
      where: { id: bookingId },
      data: { status: "CHECKED_IN", checkedInAt: new Date(), checkedInByStaffId: actor?.staffId },
      include: CARRIER_NAME_INCLUDE,
    });
  });
}

/**
 * Staff-witnessed load/unload finishing, same reasoning as checkInBooking:
 * no notification, and only reachable from CHECKED_IN — a booking can't be
 * "done" without having arrived, which also gives completedAt - checkedInAt
 * a real dwell-time window for later use.
 */
export async function completeBooking(bookingId: string, actor?: { staffId: string }) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.booking.findUnique({ where: { id: bookingId } });
    if (!existing) {
      throw new BookingNotFoundError();
    }
    if (existing.status !== "CHECKED_IN") {
      throw new InvalidStatusTransitionError(
        `Booking is ${existing.status.replace("_", " ").toLowerCase()}, not checked in`,
      );
    }

    return tx.booking.update({
      where: { id: bookingId },
      data: { status: "COMPLETED", completedAt: new Date(), completedByStaffId: actor?.staffId },
      include: CARRIER_NAME_INCLUDE,
    });
  });
}

/**
 * Deletes the booking and records a CancellationRecord in the same
 * transaction, so cancellation history survives even though the Booking row
 * itself doesn't (kept "currently-active-only" on purpose — see
 * project_dock_rule_conventions). All three cancel call sites (staff API,
 * portal API, portal UI) route through this instead of calling
 * prisma.booking.delete() directly.
 */
export async function cancelBooking(bookingId: string, actor?: BookingActor) {
  return prisma.$transaction(async (tx) => {
    const deleted = await tx.booking.delete({
      where: { id: bookingId },
      include: { dock: { select: { name: true } }, carrier: { select: { email: true } } },
    });

    await tx.cancellationRecord.create({
      data: {
        carrierId: deleted.carrierId,
        dockId: deleted.dockId,
        originalStartTime: deleted.startTime,
        originalEndTime: deleted.endTime,
        referenceNumber: deleted.referenceNumber,
        cancelledByStaffId: actor && "staffId" in actor ? actor.staffId : undefined,
        cancelledByCarrierUserId: actor && "carrierUserId" in actor ? actor.carrierUserId : undefined,
      },
    });

    return deleted;
  });
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

const NO_SHOW_GRACE_MS = 60 * 60 * 1000; // grace period after endTime before a still-SCHEDULED booking is flagged

type NoShowCandidate = { id: string; status: BookingStatus; endTime: Date };

/**
 * Looked up by id rather than passed data, like notifyBookingConfirmed — the
 * row still exists post-update. Kept private: unlike the other notifyBooking*
 * functions, it has exactly one caller (detectNoShow), not several call sites
 * opting in independently.
 */
async function notifyBookingNoShow(bookingId: string): Promise<void> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { dock: { select: { name: true } }, carrier: { select: { email: true } } },
  });
  if (!booking?.carrier.email) return;

  await sendBookingNoShowEmail(booking.carrier.email, {
    dockName: booking.dock.name,
    startTime: booking.startTime,
    endTime: booking.endTime,
    referenceNumber: booking.referenceNumber,
  });
}

/**
 * Lazy on-read no-show detection: called by every primary booking read path.
 * If a booking is still SCHEDULED long enough after its window closed, flips
 * it to NO_SHOW and notifies the carrier — both as one step, since (unlike
 * confirm/cancel/reschedule) there's no caller that legitimately wants the
 * flip without the notification. Never throws: a transient failure here must
 * not break the read it's piggybacking on.
 */
export async function detectNoShow<T extends NoShowCandidate>(booking: T): Promise<T> {
  if (booking.status !== "SCHEDULED") return booking;
  if (booking.endTime.getTime() + NO_SHOW_GRACE_MS >= Date.now()) return booking;

  try {
    await prisma.booking.update({ where: { id: booking.id }, data: { status: "NO_SHOW" } });
    await notifyBookingNoShow(booking.id);
    return { ...booking, status: "NO_SHOW" as BookingStatus };
  } catch (error) {
    console.error("No-show detection failed for booking", booking.id, error);
    return booking;
  }
}

export async function detectNoShowMany<T extends NoShowCandidate>(bookings: T[]): Promise<T[]> {
  return Promise.all(bookings.map((b) => detectNoShow(b)));
}
