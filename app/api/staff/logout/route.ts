import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { STAFF_SESSION_COOKIE } from "@/lib/staff-session";

export async function POST() {
  const store = await cookies();
  store.delete(STAFF_SESSION_COOKIE);
  return new NextResponse(null, { status: 204 });
}
