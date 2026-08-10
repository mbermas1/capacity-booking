import { NextRequest, NextResponse } from "next/server";
import {
  BookingOverlapError,
  DockNotFoundError,
  DockClosedError,
  MissingCarrierTagError,
  UnacceptedCommodityError,
  MinimumDurationError,
  createBooking,
} from "@/lib/bookings";
import { CARRIER_NAME_INCLUDE, withCarrierName } from "@/lib/booking-response";
import { prisma } from "@/lib/prisma";
import { BookingStatus, BookingPriority, LoadType } from "@/app/generated/prisma/client";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const dockId = searchParams.get("dockId");
  const carrierName = searchParams.get("carrierName");
  const referenceNumber = searchParams.get("referenceNumber");

  const errors: string[] = [];

  if (dockId !== null && !isNonEmptyString(dockId)) {
    errors.push("dockId query parameter must not be empty");
  }

  if (carrierName !== null && !isNonEmptyString(carrierName)) {
    errors.push("carrierName query parameter must not be empty");
  }

  if (referenceNumber !== null && !isNonEmptyString(referenceNumber)) {
    errors.push("referenceNumber query parameter must not be empty");
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: "Validation failed", details: errors }, { status: 400 });
  }

  if (dockId !== null) {
    const dock = await prisma.dock.findUnique({ where: { id: dockId } });
    if (!dock) {
      return NextResponse.json({ error: "Dock not found" }, { status: 404 });
    }
  }

  const bookings = await prisma.booking.findMany({
    where: {
      ...(dockId !== null ? { dockId } : {}),
      ...(carrierName !== null ? { carrier: { name: { contains: carrierName } } } : {}),
      ...(referenceNumber !== null ? { referenceNumber: { contains: referenceNumber } } : {}),
    },
    include: CARRIER_NAME_INCLUDE,
    orderBy: { startTime: "asc" },
  });

  return NextResponse.json(bookings.map(withCarrierName));
}

type CreateBookingBody = {
  dockId?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  carrierName?: unknown;
  referenceNumber?: unknown;
  loadType?: unknown;
  status?: unknown;
  priority?: unknown;
  shipmentVolume?: unknown;
  commodityTagIds?: unknown;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function POST(request: NextRequest) {
  let body: CreateBookingBody;
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
  if (!isNonEmptyString(body.carrierName)) errors.push("carrierName is required");
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

  let status: BookingStatus | undefined;
  if (body.status !== undefined) {
    const validStatuses = Object.values(BookingStatus) as string[];
    if (typeof body.status !== "string" || !validStatuses.includes(body.status)) {
      errors.push(`status must be one of: ${validStatuses.join(", ")}`);
    } else {
      status = body.status as BookingStatus;
    }
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
    const carrierName = (body.carrierName as string).trim();
    const carrier = await prisma.carrier.upsert({
      where: { name: carrierName },
      create: { name: carrierName },
      update: {},
    });

    const booking = await createBooking({
      dockId: body.dockId as string,
      startTime: startTime as Date,
      endTime: endTime as Date,
      carrierId: carrier.id,
      referenceNumber: (body.referenceNumber as string).trim(),
      loadType: body.loadType as LoadType,
      status,
      priority,
      shipmentVolume,
      commodityTagIds,
    });

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
      error instanceof MinimumDurationError
    ) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    console.error("Failed to create booking:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
