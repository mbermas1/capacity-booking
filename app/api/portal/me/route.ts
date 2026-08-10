import { NextResponse } from "next/server";
import { getPortalUser } from "@/lib/portal-session";

export async function GET() {
  const user = await getPortalUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  return NextResponse.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    carrier: { id: user.carrier.id, name: user.carrier.name, partnerType: user.carrier.partnerType },
  });
}
