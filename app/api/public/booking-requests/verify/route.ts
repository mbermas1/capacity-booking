import { NextRequest, NextResponse } from "next/server";
import { verifyBookingRequestEmail } from "@/lib/booking-requests";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "token query parameter is required" }, { status: 400 });
  }

  const result = await verifyBookingRequestEmail(token);

  if (result.outcome === "not_found") {
    return NextResponse.json({ error: "Verification link is invalid or has already been used" }, { status: 404 });
  }
  if (result.outcome === "expired") {
    return NextResponse.json({ error: "Verification link has expired" }, { status: 410 });
  }
  if (result.outcome === "unavailable") {
    return NextResponse.json({ error: "Slot no longer available" }, { status: 409 });
  }

  return NextResponse.json({ status: result.outcome.toUpperCase() });
}
