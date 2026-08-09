import { NextResponse } from "next/server";
import { getStaffMember } from "@/lib/staff-session";

export async function GET() {
  const staff = await getStaffMember();
  if (!staff) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  return NextResponse.json({ id: staff.id, name: staff.name, email: staff.email });
}
