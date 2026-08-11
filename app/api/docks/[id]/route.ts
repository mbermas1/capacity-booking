import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isDockEquipmentType } from "@/lib/dock-equipment-type";
import { Prisma, type DockEquipmentType } from "@/app/generated/prisma/client";

type UpdateDockBody = {
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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const dock = await prisma.dock.findUnique({ where: { id } });
  if (!dock) {
    return NextResponse.json({ error: "Dock not found" }, { status: 404 });
  }

  return NextResponse.json(dock);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: UpdateDockBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON" },
      { status: 400 },
    );
  }

  const errors: string[] = [];
  const data: {
    name?: string;
    location?: string;
    equipmentType?: DockEquipmentType;
    warehouseId?: string;
    capacity?: number;
    minLeadTimeMinutes?: number | null;
    bufferMinutes?: number | null;
    reservedHighPrioritySlots?: number | null;
    requiresManualReview?: boolean;
  } = {};

  if (body.name !== undefined) {
    if (!isNonEmptyString(body.name)) errors.push("name must be a non-empty string");
    else data.name = body.name.trim();
  }

  if (body.location !== undefined) {
    if (!isNonEmptyString(body.location)) errors.push("location must be a non-empty string");
    else data.location = body.location.trim();
  }

  if (body.equipmentType !== undefined) {
    if (!isDockEquipmentType(body.equipmentType)) errors.push("equipmentType must be one of STANDARD, GROUND_LEVEL");
    else data.equipmentType = body.equipmentType;
  }

  if (body.warehouseId !== undefined) {
    if (!isNonEmptyString(body.warehouseId)) errors.push("warehouseId must be a non-empty string");
    else data.warehouseId = body.warehouseId.trim();
  }

  if (body.capacity !== undefined) {
    if (!isPositiveInteger(body.capacity)) errors.push("capacity must be a positive integer");
    else data.capacity = body.capacity;
  }

  if (body.minLeadTimeMinutes !== undefined) {
    if (body.minLeadTimeMinutes === null) data.minLeadTimeMinutes = null;
    else if (!isNonNegativeInteger(body.minLeadTimeMinutes)) errors.push("minLeadTimeMinutes must be a non-negative integer or null");
    else data.minLeadTimeMinutes = body.minLeadTimeMinutes;
  }

  if (body.bufferMinutes !== undefined) {
    if (body.bufferMinutes === null) data.bufferMinutes = null;
    else if (!isNonNegativeInteger(body.bufferMinutes)) errors.push("bufferMinutes must be a non-negative integer or null");
    else data.bufferMinutes = body.bufferMinutes;
  }

  if (body.reservedHighPrioritySlots !== undefined) {
    if (body.reservedHighPrioritySlots === null) data.reservedHighPrioritySlots = null;
    else if (!isNonNegativeInteger(body.reservedHighPrioritySlots)) {
      errors.push("reservedHighPrioritySlots must be a non-negative integer or null");
    } else data.reservedHighPrioritySlots = body.reservedHighPrioritySlots;
  }

  if (body.requiresManualReview !== undefined) {
    if (typeof body.requiresManualReview !== "boolean") errors.push("requiresManualReview must be a boolean");
    else data.requiresManualReview = body.requiresManualReview;
  }

  if (Object.keys(data).length === 0 && errors.length === 0) {
    errors.push(
      "At least one of name, location, equipmentType, warehouseId, capacity, minLeadTimeMinutes, bufferMinutes, reservedHighPrioritySlots, requiresManualReview must be provided",
    );
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: "Validation failed", details: errors }, { status: 400 });
  }

  try {
    const dock = await prisma.dock.update({ where: { id }, data });
    return NextResponse.json(dock);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") {
        return NextResponse.json({ error: "Dock not found" }, { status: 404 });
      }
      if (error.code === "P2003") {
        return NextResponse.json({ error: "Warehouse not found" }, { status: 404 });
      }
    }

    console.error("Failed to update dock:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    await prisma.dock.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") {
        return NextResponse.json({ error: "Dock not found" }, { status: 404 });
      }

      if (error.code === "P2003" || error.code === "P2014") {
        return NextResponse.json(
          { error: "Cannot delete a dock that has bookings" },
          { status: 409 },
        );
      }
    }

    console.error("Failed to delete dock:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
