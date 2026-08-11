import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const warehouse = await prisma.warehouse.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      location: true,
      docks: {
        select: { id: true, name: true, location: true, dockType: true },
        orderBy: { name: "asc" },
      },
    },
  });

  if (!warehouse) {
    return NextResponse.json({ error: "Warehouse not found" }, { status: 404 });
  }

  return NextResponse.json(warehouse);
}
