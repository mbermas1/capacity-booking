import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const carriers = await prisma.carrier.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { bookings: true } } },
  });

  return NextResponse.json({
    carriers: carriers.map((carrier) => ({
      carrierName: carrier.name,
      bookingCount: carrier._count.bookings,
    })),
  });
}
