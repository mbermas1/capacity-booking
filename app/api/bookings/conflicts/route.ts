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

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const startTimeParam = searchParams.get("startTime");
  const endTimeParam = searchParams.get("endTime");
  const dockId = searchParams.get("dockId");

  const errors: string[] = [];

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

  if (dockId !== null && !isNonEmptyString(dockId)) {
    errors.push("dockId query parameter must not be empty");
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
      startTime: { lt: endTime as Date },
      endTime: { gt: startTime as Date },
    },
    include: CARRIER_NAME_INCLUDE,
    orderBy: [{ dockId: "asc" }, { startTime: "asc" }],
  });

  const byDock = new Map<string, typeof bookings>();
  for (const booking of bookings) {
    const group = byDock.get(booking.dockId);
    if (group) group.push(booking);
    else byDock.set(booking.dockId, [booking]);
  }

  const conflicts: { dockId: string; bookings: [ReturnType<typeof withCarrierName>, ReturnType<typeof withCarrierName>] }[] = [];
  for (const [dock, group] of byDock) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (overlaps(group[i], group[j])) {
          conflicts.push({ dockId: dock, bookings: [withCarrierName(group[i]), withCarrierName(group[j])] });
        }
      }
    }
  }

  return NextResponse.json({ conflicts });
}
