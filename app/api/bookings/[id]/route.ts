import { NextRequest, NextResponse } from "next/server";
import { CARRIER_NAME_INCLUDE, withCarrierName } from "@/lib/booking-response";
import { notifyBookingCancelled, detectNoShow, cancelBooking } from "@/lib/bookings";
import { prisma } from "@/lib/prisma";
import { BookingStatus, Prisma } from "@/app/generated/prisma/client";

type UpdateBookingStatusBody = {
  status?: unknown;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const rawBooking = await prisma.booking.findUnique({ where: { id }, include: CARRIER_NAME_INCLUDE });
  if (!rawBooking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }
  const booking = await detectNoShow(rawBooking);

  return NextResponse.json(withCarrierName(booking));
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: UpdateBookingStatusBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON" },
      { status: 400 },
    );
  }

  const validStatuses = Object.values(BookingStatus) as string[];
  if (typeof body.status !== "string" || !validStatuses.includes(body.status)) {
    return NextResponse.json(
      {
        error: "Validation failed",
        details: [`status must be one of: ${validStatuses.join(", ")}`],
      },
      { status: 400 },
    );
  }

  try {
    const booking = await prisma.booking.update({
      where: { id },
      data: { status: body.status as BookingStatus },
      include: CARRIER_NAME_INCLUDE,
    });

    return NextResponse.json(withCarrierName(booking));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    console.error("Failed to update booking status:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const booking = await cancelBooking(id);

    await notifyBookingCancelled(booking);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    console.error("Failed to cancel booking:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
