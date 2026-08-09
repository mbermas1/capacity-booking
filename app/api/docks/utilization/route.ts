import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
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

  const docks = await prisma.dock.findMany({
    where: dockId !== null ? { id: dockId } : undefined,
    orderBy: { name: "asc" },
  });

  if (dockId !== null && docks.length === 0) {
    return NextResponse.json({ error: "Dock not found" }, { status: 404 });
  }

  const rangeStart = startTime as Date;
  const rangeEnd = endTime as Date;
  const rangeMs = rangeEnd.getTime() - rangeStart.getTime();

  const bookings = await prisma.booking.findMany({
    where: {
      ...(dockId !== null ? { dockId } : {}),
      startTime: { lt: rangeEnd },
      endTime: { gt: rangeStart },
    },
  });

  const bookedMsByDock = new Map<string, number>();
  const bookingCountByDock = new Map<string, number>();
  for (const booking of bookings) {
    const overlapStart = booking.startTime > rangeStart ? booking.startTime : rangeStart;
    const overlapEnd = booking.endTime < rangeEnd ? booking.endTime : rangeEnd;
    const durationMs = overlapEnd.getTime() - overlapStart.getTime();

    bookedMsByDock.set(booking.dockId, (bookedMsByDock.get(booking.dockId) ?? 0) + durationMs);
    bookingCountByDock.set(booking.dockId, (bookingCountByDock.get(booking.dockId) ?? 0) + 1);
  }

  const stats = docks.map((dock) => {
    const bookedMs = bookedMsByDock.get(dock.id) ?? 0;
    return {
      dockId: dock.id,
      dockName: dock.name,
      bookingCount: bookingCountByDock.get(dock.id) ?? 0,
      bookedMs,
      totalMs: rangeMs,
      utilization: rangeMs > 0 ? bookedMs / rangeMs : 0,
    };
  });

  return NextResponse.json({
    startTime: rangeStart.toISOString(),
    endTime: rangeEnd.toISOString(),
    docks: stats,
  });
}
