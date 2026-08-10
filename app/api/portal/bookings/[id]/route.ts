import { NextRequest, NextResponse } from "next/server";
import { CARRIER_NAME_INCLUDE, withCarrierName } from "@/lib/booking-response";
import { notifyBookingCancelled } from "@/lib/bookings";
import { prisma } from "@/lib/prisma";
import { getPortalSession } from "@/lib/portal-session";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getPortalSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const booking = await prisma.booking.findUnique({ where: { id }, include: CARRIER_NAME_INCLUDE });

  if (!booking || booking.carrierId !== session.carrierId) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  return NextResponse.json(withCarrierName(booking));
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getPortalSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const booking = await prisma.booking.findUnique({ where: { id } });

  if (!booking || booking.carrierId !== session.carrierId) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  const deleted = await prisma.booking.delete({
    where: { id },
    include: { dock: { select: { name: true } }, carrier: { select: { email: true } } },
  });

  await notifyBookingCancelled(deleted);

  return new NextResponse(null, { status: 204 });
}
