import { NextRequest, NextResponse } from "next/server";
import { CARRIER_NAME_INCLUDE, withCarrierName } from "@/lib/booking-response";
import { notifyBookingCancelled, detectNoShow, cancelBooking } from "@/lib/bookings";
import { prisma } from "@/lib/prisma";
import { getPortalCarrier, getPortalUser } from "@/lib/portal-session";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const carrier = await getPortalCarrier();
  if (!carrier) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const rawBooking = await prisma.booking.findUnique({ where: { id }, include: CARRIER_NAME_INCLUDE });

  if (!rawBooking || rawBooking.carrierId !== carrier.id) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }
  const booking = await detectNoShow(rawBooking);

  return NextResponse.json(withCarrierName(booking));
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getPortalUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const booking = await prisma.booking.findUnique({ where: { id } });

  if (!booking || booking.carrierId !== user.carrier.id) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  const deleted = await cancelBooking(id, { carrierUserId: user.id });

  await notifyBookingCancelled(deleted);

  return new NextResponse(null, { status: 204 });
}
