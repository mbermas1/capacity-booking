import { NextRequest, NextResponse } from "next/server";
import { submitPublicBookingRequest } from "@/lib/booking-requests";
import { LoadType } from "@/app/generated/prisma/client";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

type CreateBookingRequestBody = {
  dockId?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  companyName?: unknown;
  contactEmail?: unknown;
  contactPhone?: unknown;
  referenceNumber?: unknown;
  loadType?: unknown;
};

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: warehouseId } = await params;

  let body: CreateBookingRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const errors: string[] = [];
  if (!isNonEmptyString(body.dockId)) errors.push("dockId is required");
  if (!isNonEmptyString(body.companyName)) errors.push("companyName is required");
  if (!isNonEmptyString(body.contactEmail)) errors.push("contactEmail is required");
  if (body.contactPhone !== undefined && typeof body.contactPhone !== "string") {
    errors.push("contactPhone must be a string if provided");
  }
  if (!isNonEmptyString(body.referenceNumber)) errors.push("referenceNumber is required");
  if (body.loadType !== LoadType.INBOUND && body.loadType !== LoadType.OUTBOUND) {
    errors.push(`loadType must be one of: ${Object.values(LoadType).join(", ")}`);
  }

  const startTime = isNonEmptyString(body.startTime) ? new Date(body.startTime) : null;
  if (!startTime || Number.isNaN(startTime.getTime())) {
    errors.push("startTime must be a valid ISO 8601 date string");
  }

  const endTime = isNonEmptyString(body.endTime) ? new Date(body.endTime) : null;
  if (!endTime || Number.isNaN(endTime.getTime())) {
    errors.push("endTime must be a valid ISO 8601 date string");
  }

  if (startTime && endTime && endTime <= startTime) {
    errors.push("endTime must be after startTime");
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: "Validation failed", details: errors }, { status: 400 });
  }

  const result = await submitPublicBookingRequest({
    warehouseId,
    dockId: body.dockId as string,
    startTime: startTime as Date,
    endTime: endTime as Date,
    companyName: (body.companyName as string).trim(),
    contactEmail: (body.contactEmail as string).trim(),
    contactPhone: isNonEmptyString(body.contactPhone) ? body.contactPhone.trim() : undefined,
    referenceNumber: (body.referenceNumber as string).trim(),
    loadType: body.loadType as LoadType,
  });

  if (result.outcome === "dock_not_found") {
    return NextResponse.json({ error: "Dock not found" }, { status: 404 });
  }
  if (result.outcome === "unavailable") {
    return NextResponse.json({ error: "This slot is no longer available" }, { status: 409 });
  }

  return NextResponse.json({ id: result.bookingRequestId, status: result.outcome.toUpperCase() }, { status: 201 });
}
