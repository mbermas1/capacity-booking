import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const searchParams = request.nextUrl.searchParams;
  const startTimeParam = searchParams.get("startTime");
  const endTimeParam = searchParams.get("endTime");

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

  if (errors.length > 0) {
    return NextResponse.json({ error: "Validation failed", details: errors }, { status: 400 });
  }

  const dock = await prisma.dock.findUnique({ where: { id } });
  if (!dock) {
    return NextResponse.json({ error: "Dock not found" }, { status: 404 });
  }

  const conflicts = await prisma.booking.findMany({
    where: {
      dockId: id,
      startTime: { lt: endTime as Date },
      endTime: { gt: startTime as Date },
    },
    orderBy: { startTime: "asc" },
  });

  return NextResponse.json({ available: conflicts.length === 0, conflicts });
}
