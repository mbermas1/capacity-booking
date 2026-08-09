import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function parsePositiveInt(value: string | null): number | null {
  if (value === null) return null;
  if (!/^\d+$/.test(value)) return NaN;
  return Number(value);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
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

  const dock = await prisma.dock.findUnique({ where: { id } });
  if (!dock) {
    return NextResponse.json({ error: "Dock not found" }, { status: 404 });
  }

  const [total, bookings] = await Promise.all([
    prisma.booking.count({ where: { dockId: id } }),
    prisma.booking.findMany({
      where: { dockId: id },
      orderBy: { startTime: "desc" },
      skip: offset,
      take: limit,
    }),
  ]);

  return NextResponse.json({ total, limit, offset, bookings });
}
