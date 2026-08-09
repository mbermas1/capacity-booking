import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const grouped = await prisma.booking.groupBy({
    by: ["carrierName"],
    _count: { _all: true },
    orderBy: { carrierName: "asc" },
  });

  const carriers = grouped.map((group) => ({
    carrierName: group.carrierName,
    bookingCount: group._count._all,
  }));

  return NextResponse.json({ carriers });
}
