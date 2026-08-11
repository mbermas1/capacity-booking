import { NextRequest, NextResponse } from "next/server";
import { withCarrierName } from "@/lib/booking-response";
import {
  BookingNotFoundError,
  BookingOverlapError,
  DockClosedError,
  MissingCarrierTagError,
  UnacceptedCommodityError,
  MinimumDurationError,
  LaborCapacityError,
  YardCapacityError,
  rescheduleBooking,
  notifyBookingRescheduled,
} from "@/lib/bookings";

type RescheduleBookingBody = {
  startTime?: unknown;
  endTime?: unknown;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: RescheduleBookingBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const errors: string[] = [];

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

  try {
    const { booking, previousStartTime, previousEndTime } = await rescheduleBooking(id, {
      startTime: startTime as Date,
      endTime: endTime as Date,
    });

    await notifyBookingRescheduled(booking.id, previousStartTime, previousEndTime);

    return NextResponse.json(withCarrierName(booking));
  } catch (error) {
    if (error instanceof BookingNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (
      error instanceof BookingOverlapError ||
      error instanceof DockClosedError ||
      error instanceof MissingCarrierTagError ||
      error instanceof UnacceptedCommodityError ||
      error instanceof MinimumDurationError ||
      error instanceof LaborCapacityError ||
      error instanceof YardCapacityError
    ) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    console.error("Failed to reschedule booking:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
