import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeUtilization } from "@/lib/utilization";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const carrierName = name.trim();
  const searchParams = request.nextUrl.searchParams;
  const dateParam = searchParams.get("date");
  const startTimeParam = searchParams.get("startTime");
  const endTimeParam = searchParams.get("endTime");
  const dockId = searchParams.get("dockId");

  const errors: string[] = [];

  if (carrierName.length === 0) {
    errors.push("carrier name must not be empty");
  }

  let rangeStart: Date | null = null;
  let rangeEnd: Date | null = null;

  if (dateParam !== null) {
    if (startTimeParam !== null || endTimeParam !== null) {
      errors.push("Provide either date or startTime/endTime, not both");
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      errors.push("date query parameter must be in YYYY-MM-DD format");
    } else {
      const dayStart = new Date(`${dateParam}T00:00:00.000Z`);
      if (Number.isNaN(dayStart.getTime())) {
        errors.push("date query parameter must be a valid calendar date");
      } else {
        rangeStart = dayStart;
        rangeEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      }
    }
  } else {
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

    rangeStart = startTime;
    rangeEnd = endTime;
  }

  if (dockId !== null && !isNonEmptyString(dockId)) {
    errors.push("dockId query parameter must not be empty");
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: "Validation failed", details: errors }, { status: 400 });
  }

  if (dockId !== null) {
    const scopedDock = await prisma.dock.findUnique({ where: { id: dockId } });
    if (!scopedDock) {
      return NextResponse.json({ error: "Dock not found" }, { status: 404 });
    }
  }

  const rangeStartDate = rangeStart as Date;
  const rangeEndDate = rangeEnd as Date;

  const stats = await computeUtilization(rangeStartDate, rangeEndDate, {
    dockId: dockId ?? undefined,
    carrierName,
  });

  return NextResponse.json({
    carrierName,
    startTime: rangeStartDate.toISOString(),
    endTime: rangeEndDate.toISOString(),
    docks: stats,
  });
}
