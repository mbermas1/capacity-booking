import { NextRequest, NextResponse } from "next/server";
import { BookingNotFoundError, InvalidStatusTransitionError, completeBooking } from "@/lib/bookings";
import { withCarrierName } from "@/lib/booking-response";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const booking = await completeBooking(id);
    return NextResponse.json(withCarrierName(booking));
  } catch (error) {
    if (error instanceof BookingNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (error instanceof InvalidStatusTransitionError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    console.error("Failed to complete booking:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
