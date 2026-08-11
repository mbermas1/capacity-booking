import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPortalUser } from "@/lib/portal-session";

export async function GET() {
  const user = await getPortalUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const docks = await prisma.dock.findMany({
    where: { warehouse: { accountId: user.carrier.accountId } },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(docks);
}
