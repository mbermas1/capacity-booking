import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isDockEquipmentType } from "@/lib/dock-equipment-type";
import type { DockEquipmentType } from "@/app/generated/prisma/client";

type BulkDockInput = {
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

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON" },
      { status: 400 },
    );
  }

  if (!Array.isArray(body)) {
    return NextResponse.json(
      { error: "Validation failed", details: ["Request body must be an array of docks"] },
      { status: 400 },
    );
  }

  if (body.length === 0) {
    return NextResponse.json(
      { error: "Validation failed", details: ["At least one dock must be provided"] },
      { status: 400 },
    );
  }

  const errors: string[] = [];
  const docksInput = body as BulkDockInput[];

  docksInput.forEach((item, index) => {
    if (!isNonEmptyString(item?.name)) errors.push(`docks[${index}].name is required`);
    if (!isNonEmptyString(item?.location)) errors.push(`docks[${index}].location is required`);
    if (!isDockEquipmentType(item?.equipmentType)) errors.push(`docks[${index}].equipmentType must be one of STANDARD, GROUND_LEVEL`);
    if (!isNonEmptyString(item?.warehouseId)) errors.push(`docks[${index}].warehouseId is required`);
    if (item?.capacity !== undefined && !isPositiveInteger(item.capacity)) {
      errors.push(`docks[${index}].capacity must be a positive integer if provided`);
    }
    if (item?.minLeadTimeMinutes !== undefined && !isNonNegativeInteger(item.minLeadTimeMinutes)) {
      errors.push(`docks[${index}].minLeadTimeMinutes must be a non-negative integer if provided`);
    }
    if (item?.bufferMinutes !== undefined && !isNonNegativeInteger(item.bufferMinutes)) {
      errors.push(`docks[${index}].bufferMinutes must be a non-negative integer if provided`);
    }
    if (item?.reservedHighPrioritySlots !== undefined && !isNonNegativeInteger(item.reservedHighPrioritySlots)) {
      errors.push(`docks[${index}].reservedHighPrioritySlots must be a non-negative integer if provided`);
    }
    if (item?.requiresManualReview !== undefined && typeof item.requiresManualReview !== "boolean") {
      errors.push(`docks[${index}].requiresManualReview must be a boolean if provided`);
    }
  });

  if (errors.length > 0) {
    return NextResponse.json({ error: "Validation failed", details: errors }, { status: 400 });
  }

  const requestedWarehouseIds = [...new Set(docksInput.map((item) => item.warehouseId as string))];
  const foundWarehouses = await prisma.warehouse.findMany({ where: { id: { in: requestedWarehouseIds } } });
  const foundWarehouseIds = new Set(foundWarehouses.map((w) => w.id));
  const missingWarehouseIds = requestedWarehouseIds.filter((id) => !foundWarehouseIds.has(id));

  if (missingWarehouseIds.length > 0) {
    return NextResponse.json(
      { error: "Warehouse not found", details: missingWarehouseIds },
      { status: 404 },
    );
  }

  const docks = await prisma.$transaction(async (tx) => {
    const created = [];
    for (const item of docksInput) {
      created.push(
        await tx.dock.create({
          data: {
            name: (item.name as string).trim(),
            location: (item.location as string).trim(),
            equipmentType: item.equipmentType as DockEquipmentType,
            warehouseId: item.warehouseId as string,
            ...(item.capacity !== undefined ? { capacity: item.capacity as number } : {}),
            ...(item.minLeadTimeMinutes !== undefined ? { minLeadTimeMinutes: item.minLeadTimeMinutes as number } : {}),
            ...(item.bufferMinutes !== undefined ? { bufferMinutes: item.bufferMinutes as number } : {}),
            ...(item.reservedHighPrioritySlots !== undefined
              ? { reservedHighPrioritySlots: item.reservedHighPrioritySlots as number }
              : {}),
            ...(item.requiresManualReview !== undefined
              ? { requiresManualReview: item.requiresManualReview as boolean }
              : {}),
          },
        }),
      );
    }
    return created;
  });

  return NextResponse.json({ docks }, { status: 201 });
}
