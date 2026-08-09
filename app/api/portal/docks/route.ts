import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPortalSession } from "@/lib/portal-session";

export async function GET() {
  const session = await getPortalSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const docks = await prisma.dock.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(docks);
}
