import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { PORTAL_SESSION_COOKIE } from "@/lib/portal-session";

export async function POST() {
  const store = await cookies();
  store.delete(PORTAL_SESSION_COOKIE);
  return new NextResponse(null, { status: 204 });
}
