import { NextResponse } from "next/server";
import { getPortalCarrier } from "@/lib/portal-session";

export async function GET() {
  const carrier = await getPortalCarrier();
  if (!carrier) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  return NextResponse.json({
    id: carrier.id,
    name: carrier.name,
    email: carrier.email,
    partnerType: carrier.partnerType,
  });
}
