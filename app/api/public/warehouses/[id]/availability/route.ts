import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPublicDockAvailability } from "@/lib/availability";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: warehouseId } = await params;
  const searchParams = request.nextUrl.searchParams;
  const dockId = searchParams.get("dockId");
  const startTimeRaw = searchParams.get("startTime");
  const endTimeRaw = searchParams.get("endTime");

  const errors: string[] = [];
  if (!isNonEmptyString(dockId)) errors.push("dockId query parameter is required");

  const startTime = isNonEmptyString(startTimeRaw) ? new Date(startTimeRaw) : null;
  if (!startTime || Number.isNaN(startTime.getTime())) {
    errors.push("startTime query parameter must be a valid ISO 8601 date string");
  }

  const endTime = isNonEmptyString(endTimeRaw) ? new Date(endTimeRaw) : null;
  if (!endTime || Number.isNaN(endTime.getTime())) {
    errors.push("endTime query parameter must be a valid ISO 8601 date string");
  }

  if (startTime && endTime && endTime <= startTime) {
    errors.push("endTime must be after startTime");
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: "Validation failed", details: errors }, { status: 400 });
  }

  const dock = await prisma.dock.findUnique({ where: { id: dockId as string }, select: { warehouseId: true } });
  if (!dock || dock.warehouseId !== warehouseId) {
    return NextResponse.json({ error: "Dock not found" }, { status: 404 });
  }

  const availability = await getPublicDockAvailability(dockId as string, startTime as Date, endTime as Date);
  return NextResponse.json(availability);
}
