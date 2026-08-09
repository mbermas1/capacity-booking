import { NextRequest, NextResponse } from "next/server";
import { CARRIER_NAME_INCLUDE, withCarrierName } from "@/lib/booking-response";
import { prisma } from "@/lib/prisma";
import type { Booking } from "@/app/generated/prisma/client";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function overlaps(a: Booking, b: Booking): boolean {
  return a.startTime < b.endTime && b.startTime < a.endTime;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const carrierName = name.trim();
  const searchParams = request.nextUrl.searchParams;
  const startTimeParam = searchParams.get("startTime");
  const endTimeParam = searchParams.get("endTime");

  const errors: string[] = [];

  if (carrierName.length === 0) {
    errors.push("carrier name must not be empty");
  }

  const startTime = isNonEmptyString(startTimeParam) ? new Date(startTimeParam) : null;
  if (!startTime || Number.isNaN(startTime.getTime())) {
    errors.push("startTime query parameter must be a valid ISO 8601 date string");
  }

  const endTime = isNonEmptyString(endTimeParam) ? new Date(endTimeParam) : null;
  if (!endTime || Number.isNaN(endTime.getTime())) {
    errors.push("endTime query parameter must be a valid ISO 8601 date string");
  }

  if (startTime && endTime && endTime <= startTime) {
    errors.push("endTime must be after startTime");
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: "Validation failed", details: errors }, { status: 400 });
  }

  const bookings = await prisma.booking.findMany({
    where: {
      carrier: { name: carrierName },
      startTime: { lt: endTime as Date },
      endTime: { gt: startTime as Date },
    },
    include: CARRIER_NAME_INCLUDE,
    orderBy: { startTime: "asc" },
  });

  const conflicts: { bookings: [ReturnType<typeof withCarrierName>, ReturnType<typeof withCarrierName>] }[] = [];
  for (let i = 0; i < bookings.length; i++) {
    for (let j = i + 1; j < bookings.length; j++) {
      if (overlaps(bookings[i], bookings[j])) {
        conflicts.push({ bookings: [withCarrierName(bookings[i]), withCarrierName(bookings[j])] });
      }
    }
  }

  return NextResponse.json({ carrierName, conflicts });
}
