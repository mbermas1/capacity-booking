import { NextRequest, NextResponse } from "next/server";
import { withCarrierName } from "@/lib/booking-response";
import { createBookingWithTx } from "@/lib/bookings";
import { findOrCreateCarrierByName } from "@/lib/carrier-identity";
import { prisma } from "@/lib/prisma";
import { BookingStatus, BookingPriority, LoadType } from "@/app/generated/prisma/client";

type BulkBookingInput = {
  dockId?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  carrierName?: unknown;
  referenceNumber?: unknown;
  loadType?: unknown;
  status?: unknown;
  priority?: unknown;
  shipmentVolume?: unknown;
  commodityTagIds?: unknown;
};

type ParsedBooking = {
  dockId: string;
  startTime: Date;
  endTime: Date;
  carrierName: string;
  referenceNumber: string;
  loadType: LoadType;
  status?: BookingStatus;
  priority?: BookingPriority;
  shipmentVolume?: number;
  commodityTagIds?: string[];
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

class BulkBookingError extends Error {
  constructor(index: number, referenceNumber: string, cause: Error) {
    super(`bookings[${index}] (referenceNumber: ${referenceNumber}): ${cause.message}`);
    this.name = "BulkBookingError";
  }
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
      { error: "Validation failed", details: ["Request body must be an array of bookings"] },
      { status: 400 },
    );
  }

  if (body.length === 0) {
    return NextResponse.json(
      { error: "Validation failed", details: ["At least one booking must be provided"] },
      { status: 400 },
    );
  }

  const bookingsInput = body as BulkBookingInput[];
  const errors: string[] = [];
  const parsed: ParsedBooking[] = [];

  bookingsInput.forEach((item, index) => {
    const itemErrors: string[] = [];

    if (!isNonEmptyString(item?.dockId)) itemErrors.push(`bookings[${index}].dockId is required`);
    if (!isNonEmptyString(item?.carrierName)) itemErrors.push(`bookings[${index}].carrierName is required`);
    if (!isNonEmptyString(item?.referenceNumber)) itemErrors.push(`bookings[${index}].referenceNumber is required`);

    const startTime = isNonEmptyString(item?.startTime) ? new Date(item.startTime) : null;
    if (!startTime || Number.isNaN(startTime.getTime())) {
      itemErrors.push(`bookings[${index}].startTime must be a valid ISO 8601 date string`);
    }

    const endTime = isNonEmptyString(item?.endTime) ? new Date(item.endTime) : null;
    if (!endTime || Number.isNaN(endTime.getTime())) {
      itemErrors.push(`bookings[${index}].endTime must be a valid ISO 8601 date string`);
    }

    if (startTime && endTime && endTime <= startTime) {
      itemErrors.push(`bookings[${index}].endTime must be after startTime`);
    }

    if (item?.loadType !== LoadType.INBOUND && item?.loadType !== LoadType.OUTBOUND) {
      itemErrors.push(`bookings[${index}].loadType must be one of: ${Object.values(LoadType).join(", ")}`);
    }

    let status: BookingStatus | undefined;
    if (item?.status !== undefined) {
      const validStatuses = Object.values(BookingStatus) as string[];
      if (typeof item.status !== "string" || !validStatuses.includes(item.status)) {
        itemErrors.push(`bookings[${index}].status must be one of: ${validStatuses.join(", ")}`);
      } else {
        status = item.status as BookingStatus;
      }
    }

    let priority: BookingPriority | undefined;
    if (item?.priority !== undefined) {
      const validPriorities = Object.values(BookingPriority) as string[];
      if (typeof item.priority !== "string" || !validPriorities.includes(item.priority)) {
        itemErrors.push(`bookings[${index}].priority must be one of: ${validPriorities.join(", ")}`);
      } else {
        priority = item.priority as BookingPriority;
      }
    }

    let shipmentVolume: number | undefined;
    if (item?.shipmentVolume !== undefined) {
      if (typeof item.shipmentVolume !== "number" || !Number.isInteger(item.shipmentVolume) || item.shipmentVolume < 0) {
        itemErrors.push(`bookings[${index}].shipmentVolume must be a non-negative integer`);
      } else {
        shipmentVolume = item.shipmentVolume;
      }
    }

    let commodityTagIds: string[] | undefined;
    if (item?.commodityTagIds !== undefined) {
      if (!Array.isArray(item.commodityTagIds) || !item.commodityTagIds.every((id) => typeof id === "string")) {
        itemErrors.push(`bookings[${index}].commodityTagIds must be an array of strings`);
      } else {
        commodityTagIds = item.commodityTagIds;
      }
    }

    errors.push(...itemErrors);

    if (itemErrors.length === 0) {
      parsed.push({
        dockId: item.dockId as string,
        startTime: startTime as Date,
        endTime: endTime as Date,
        carrierName: (item.carrierName as string).trim(),
        referenceNumber: (item.referenceNumber as string).trim(),
        loadType: item.loadType as LoadType,
        status,
        priority,
        shipmentVolume,
        commodityTagIds,
      });
    }
  });

  if (errors.length > 0) {
    return NextResponse.json({ error: "Validation failed", details: errors }, { status: 400 });
  }

  const requestedDockIds = [...new Set(parsed.map((item) => item.dockId))];
  const foundDocks = await prisma.dock.findMany({
    where: { id: { in: requestedDockIds } },
    include: { warehouse: true },
  });
  const foundDockIds = new Set(foundDocks.map((dock) => dock.id));
  const accountIdByDockId = new Map(foundDocks.map((dock) => [dock.id, dock.warehouse.accountId]));
  const missingDockIds = requestedDockIds.filter((id) => !foundDockIds.has(id));

  if (missingDockIds.length > 0) {
    return NextResponse.json(
      { error: "Dock not found", details: missingDockIds },
      { status: 404 },
    );
  }

  try {
    const bookings = await prisma.$transaction(async (tx) => {
      const created = [];
      for (let index = 0; index < parsed.length; index++) {
        const item = parsed[index];

        const carrier = await findOrCreateCarrierByName(tx, accountIdByDockId.get(item.dockId)!, item.carrierName);

        try {
          created.push(
            await createBookingWithTx(tx, {
              dockId: item.dockId,
              startTime: item.startTime,
              endTime: item.endTime,
              carrierId: carrier.id,
              referenceNumber: item.referenceNumber,
              loadType: item.loadType,
              status: item.status,
              priority: item.priority,
              shipmentVolume: item.shipmentVolume,
              commodityTagIds: item.commodityTagIds,
            }),
          );
        } catch (cause) {
          throw new BulkBookingError(index, item.referenceNumber, cause as Error);
        }
      }
      return created;
    });

    return NextResponse.json({ bookings: bookings.map(withCarrierName) }, { status: 201 });
  } catch (error) {
    if (error instanceof BulkBookingError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    console.error("Failed to bulk-import bookings:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
