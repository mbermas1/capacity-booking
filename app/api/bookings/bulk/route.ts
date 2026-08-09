import { NextRequest, NextResponse } from "next/server";
import { CARRIER_NAME_INCLUDE, withCarrierName } from "@/lib/booking-response";
import { prisma } from "@/lib/prisma";
import { BookingStatus, LoadType } from "@/app/generated/prisma/client";

type BulkBookingInput = {
  dockId?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  carrierName?: unknown;
  referenceNumber?: unknown;
  loadType?: unknown;
  status?: unknown;
};

type ParsedBooking = {
  dockId: string;
  startTime: Date;
  endTime: Date;
  carrierName: string;
  referenceNumber: string;
  loadType: LoadType;
  status?: BookingStatus;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

class BulkOverlapError extends Error {
  constructor(index: number, referenceNumber: string) {
    super(
      `bookings[${index}] (referenceNumber: ${referenceNumber}) overlaps an existing or another batch booking on this dock`,
    );
    this.name = "BulkOverlapError";
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
      });
    }
  });

  if (errors.length > 0) {
    return NextResponse.json({ error: "Validation failed", details: errors }, { status: 400 });
  }

  const requestedDockIds = [...new Set(parsed.map((item) => item.dockId))];
  const foundDocks = await prisma.dock.findMany({ where: { id: { in: requestedDockIds } } });
  const foundDockIds = new Set(foundDocks.map((dock) => dock.id));
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

        const overlap = await tx.booking.findFirst({
          where: {
            dockId: item.dockId,
            startTime: { lt: item.endTime },
            endTime: { gt: item.startTime },
          },
        });

        if (overlap) {
          throw new BulkOverlapError(index, item.referenceNumber);
        }

        const carrier = await tx.carrier.upsert({
          where: { name: item.carrierName },
          create: { name: item.carrierName },
          update: {},
        });

        created.push(
          await tx.booking.create({
            data: {
              dockId: item.dockId,
              startTime: item.startTime,
              endTime: item.endTime,
              carrierId: carrier.id,
              referenceNumber: item.referenceNumber,
              loadType: item.loadType,
              status: item.status,
            },
            include: CARRIER_NAME_INCLUDE,
          }),
        );
      }
      return created;
    });

    return NextResponse.json({ bookings: bookings.map(withCarrierName) }, { status: 201 });
  } catch (error) {
    if (error instanceof BulkOverlapError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    console.error("Failed to bulk-import bookings:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
