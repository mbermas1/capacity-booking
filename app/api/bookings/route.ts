import { NextRequest, NextResponse } from "next/server";
import { BookingOverlapError, createBooking } from "@/lib/bookings";
import { prisma } from "@/lib/prisma";
import { BookingStatus, LoadType, Prisma } from "@/app/generated/prisma/client";

export async function GET(request: NextRequest) {
  const dockId = request.nextUrl.searchParams.get("dockId");

  if (dockId !== null) {
    if (!isNonEmptyString(dockId)) {
      return NextResponse.json(
        { error: "Validation failed", details: ["dockId query parameter must not be empty"] },
        { status: 400 },
      );
    }

    const dock = await prisma.dock.findUnique({ where: { id: dockId } });
    if (!dock) {
      return NextResponse.json({ error: "Dock not found" }, { status: 404 });
    }
  }

  const bookings = await prisma.booking.findMany({
    where: dockId !== null ? { dockId } : undefined,
    orderBy: { startTime: "asc" },
  });

  return NextResponse.json(bookings);
}

type CreateBookingBody = {
  dockId?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  carrierName?: unknown;
  referenceNumber?: unknown;
  loadType?: unknown;
  status?: unknown;
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

  if (errors.length > 0) {
    return NextResponse.json({ error: "Validation failed", details: errors }, { status: 400 });
  }

  try {
    const booking = await createBooking({
      dockId: body.dockId as string,
      startTime: startTime as Date,
      endTime: endTime as Date,
      carrierName: (body.carrierName as string).trim(),
      referenceNumber: (body.referenceNumber as string).trim(),
      loadType: body.loadType as LoadType,
      status,
    });

    return NextResponse.json(booking, { status: 201 });
  } catch (error) {
    if (error instanceof BookingOverlapError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return NextResponse.json({ error: "Dock not found" }, { status: 404 });
    }

    console.error("Failed to create booking:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
