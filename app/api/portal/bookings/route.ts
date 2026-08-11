import { NextRequest, NextResponse } from "next/server";
import {
  BookingOverlapError,
  DockNotFoundError,
  DockClosedError,
  MissingCarrierTagError,
  UnacceptedCommodityError,
  MinimumDurationError,
  LeadTimeError,
  LaborCapacityError,
  YardCapacityError,
  createBooking,
  notifyBookingConfirmed,
  detectNoShowMany,
} from "@/lib/bookings";
import { checkLeadTime } from "@/lib/booking-constraints";
import { CARRIER_NAME_INCLUDE, withCarrierName } from "@/lib/booking-response";
import { prisma } from "@/lib/prisma";
import { getPortalCarrier } from "@/lib/portal-session";
import { LoadType, BookingPriority } from "@/app/generated/prisma/client";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parsePositiveInt(value: string | null): number | null {
  if (value === null) return null;
  if (!/^\d+$/.test(value)) return NaN;
  return Number(value);
}

export async function GET(request: NextRequest) {
  const carrier = await getPortalCarrier();
  if (!carrier) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const errors: string[] = [];

  const limitParam = parsePositiveInt(searchParams.get("limit"));
  const limit = limitParam ?? DEFAULT_LIMIT;
  if (Number.isNaN(limitParam) || limit < 1 || limit > MAX_LIMIT) {
    errors.push(`limit must be an integer between 1 and ${MAX_LIMIT}`);
  }

  const offsetParam = parsePositiveInt(searchParams.get("offset"));
  const offset = offsetParam ?? 0;
  if (Number.isNaN(offsetParam) || offset < 0) {
    errors.push("offset must be a non-negative integer");
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: "Validation failed", details: errors }, { status: 400 });
  }

  const [total, rawBookings] = await Promise.all([
    prisma.booking.count({ where: { carrierId: carrier.id } }),
    prisma.booking.findMany({
      where: { carrierId: carrier.id },
      include: CARRIER_NAME_INCLUDE,
      orderBy: { startTime: "desc" },
      skip: offset,
      take: limit,
    }),
  ]);
  const bookings = await detectNoShowMany(rawBookings);

  return NextResponse.json({ total, limit, offset, bookings: bookings.map(withCarrierName) });
}

type CreatePortalBookingBody = {
  dockId?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  referenceNumber?: unknown;
  loadType?: unknown;
  priority?: unknown;
  shipmentVolume?: unknown;
  commodityTagIds?: unknown;
};

export async function POST(request: NextRequest) {
  const carrier = await getPortalCarrier();
  if (!carrier) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: CreatePortalBookingBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON" },
      { status: 400 },
    );
  }

  const errors: string[] = [];

  if (!isNonEmptyString(body.dockId)) errors.push("dockId is required");
  if (!isNonEmptyString(body.referenceNumber)) errors.push("referenceNumber is required");

  const startTime = isNonEmptyString(body.startTime) ? new Date(body.startTime) : null;
  if (!startTime || Number.isNaN(startTime.getTime())) {
    errors.push("startTime must be a valid ISO 8601 date string");
  }

  const endTime = isNonEmptyString(body.endTime) ? new Date(body.endTime) : null;
  if (!endTime || Number.isNaN(endTime.getTime())) {
    errors.push("endTime must be a valid ISO 8601 date string");
  }

  if (startTime && endTime && endTime <= startTime) {
    errors.push("endTime must be after startTime");
  }

  if (body.loadType !== LoadType.INBOUND && body.loadType !== LoadType.OUTBOUND) {
    errors.push(`loadType must be one of: ${Object.values(LoadType).join(", ")}`);
  }

  let priority: BookingPriority | undefined;
  if (body.priority !== undefined) {
    const validPriorities = Object.values(BookingPriority) as string[];
    if (typeof body.priority !== "string" || !validPriorities.includes(body.priority)) {
      errors.push(`priority must be one of: ${validPriorities.join(", ")}`);
    } else {
      priority = body.priority as BookingPriority;
    }
  }

  let shipmentVolume: number | undefined;
  if (body.shipmentVolume !== undefined) {
    if (typeof body.shipmentVolume !== "number" || !Number.isInteger(body.shipmentVolume) || body.shipmentVolume < 0) {
      errors.push("shipmentVolume must be a non-negative integer");
    } else {
      shipmentVolume = body.shipmentVolume;
    }
  }

  let commodityTagIds: string[] | undefined;
  if (body.commodityTagIds !== undefined) {
    if (!Array.isArray(body.commodityTagIds) || !body.commodityTagIds.every((id) => typeof id === "string")) {
      errors.push("commodityTagIds must be an array of strings");
    } else {
      commodityTagIds = body.commodityTagIds;
    }
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: "Validation failed", details: errors }, { status: 400 });
  }

  try {
    const dock = await prisma.dock.findUnique({
      where: { id: body.dockId as string },
      select: { minLeadTimeMinutes: true },
    });
    if (priority !== BookingPriority.HIGH && dock && checkLeadTime(dock.minLeadTimeMinutes, startTime as Date, new Date())) {
      throw new LeadTimeError(dock.minLeadTimeMinutes as number);
    }

    const booking = await createBooking({
      dockId: body.dockId as string,
      startTime: startTime as Date,
      endTime: endTime as Date,
      carrierId: carrier.id,
      referenceNumber: (body.referenceNumber as string).trim(),
      loadType: body.loadType as LoadType,
      priority,
      shipmentVolume,
      commodityTagIds,
    });

    await notifyBookingConfirmed(booking.id);

    return NextResponse.json(withCarrierName(booking), { status: 201 });
  } catch (error) {
    if (error instanceof DockNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (
      error instanceof BookingOverlapError ||
      error instanceof DockClosedError ||
      error instanceof MissingCarrierTagError ||
      error instanceof UnacceptedCommodityError ||
      error instanceof MinimumDurationError ||
      error instanceof LeadTimeError ||
      error instanceof LaborCapacityError ||
      error instanceof YardCapacityError
    ) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    console.error("Failed to create portal booking:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
