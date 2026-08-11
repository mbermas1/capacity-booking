import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isDockEquipmentType } from "@/lib/dock-equipment-type";
import { Prisma, type DockEquipmentType } from "@/app/generated/prisma/client";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function GET(request: NextRequest) {
  const warehouseId = request.nextUrl.searchParams.get("warehouseId");

  if (warehouseId !== null && !isNonEmptyString(warehouseId)) {
    return NextResponse.json(
      { error: "Validation failed", details: ["warehouseId query parameter must not be empty"] },
      { status: 400 },
    );
  }

  const docks = await prisma.dock.findMany({
    where: warehouseId !== null ? { warehouseId } : undefined,
    orderBy: { name: "asc" },
  });
  return NextResponse.json(docks);
}

type CreateDockBody = {
  name?: unknown;
  location?: unknown;
  equipmentType?: unknown;
  warehouseId?: unknown;
  capacity?: unknown;
  minLeadTimeMinutes?: unknown;
  bufferMinutes?: unknown;
  reservedHighPrioritySlots?: unknown;
  requiresManualReview?: unknown;
};

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export async function POST(request: NextRequest) {
  let body: CreateDockBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON" },
      { status: 400 },
    );
  }

  const errors: string[] = [];

  if (!isNonEmptyString(body.name)) errors.push("name is required");
  if (!isNonEmptyString(body.location)) errors.push("location is required");
  if (!isDockEquipmentType(body.equipmentType)) errors.push("equipmentType must be one of STANDARD, GROUND_LEVEL");
  if (!isNonEmptyString(body.warehouseId)) errors.push("warehouseId is required");
  if (body.capacity !== undefined && !isPositiveInteger(body.capacity)) {
    errors.push("capacity must be a positive integer if provided");
  }
  if (body.minLeadTimeMinutes !== undefined && !isNonNegativeInteger(body.minLeadTimeMinutes)) {
    errors.push("minLeadTimeMinutes must be a non-negative integer if provided");
  }
  if (body.bufferMinutes !== undefined && !isNonNegativeInteger(body.bufferMinutes)) {
    errors.push("bufferMinutes must be a non-negative integer if provided");
  }
  if (body.reservedHighPrioritySlots !== undefined && !isNonNegativeInteger(body.reservedHighPrioritySlots)) {
    errors.push("reservedHighPrioritySlots must be a non-negative integer if provided");
  }
  if (body.requiresManualReview !== undefined && typeof body.requiresManualReview !== "boolean") {
    errors.push("requiresManualReview must be a boolean if provided");
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: "Validation failed", details: errors }, { status: 400 });
  }

  try {
    const dock = await prisma.dock.create({
      data: {
        name: (body.name as string).trim(),
        location: (body.location as string).trim(),
        equipmentType: body.equipmentType as DockEquipmentType,
        warehouseId: body.warehouseId as string,
        ...(body.capacity !== undefined ? { capacity: body.capacity as number } : {}),
        ...(body.minLeadTimeMinutes !== undefined ? { minLeadTimeMinutes: body.minLeadTimeMinutes as number } : {}),
        ...(body.bufferMinutes !== undefined ? { bufferMinutes: body.bufferMinutes as number } : {}),
        ...(body.reservedHighPrioritySlots !== undefined
          ? { reservedHighPrioritySlots: body.reservedHighPrioritySlots as number }
          : {}),
        ...(body.requiresManualReview !== undefined
          ? { requiresManualReview: body.requiresManualReview as boolean }
          : {}),
      },
    });

    return NextResponse.json(dock, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return NextResponse.json({ error: "Warehouse not found" }, { status: 404 });
    }

    console.error("Failed to create dock:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
