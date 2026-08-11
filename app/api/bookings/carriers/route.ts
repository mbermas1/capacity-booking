import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const warehouseId = request.nextUrl.searchParams.get("warehouseId");
  if (!warehouseId) {
    return NextResponse.json(
      { error: "Validation failed", details: ["warehouseId query parameter is required"] },
      { status: 400 },
    );
  }

  const warehouse = await prisma.warehouse.findUnique({ where: { id: warehouseId }, select: { accountId: true } });
  if (!warehouse) {
    return NextResponse.json({ error: "Warehouse not found" }, { status: 404 });
  }

  const carriers = await prisma.carrier.findMany({
    where: { accountId: warehouse.accountId },
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
