import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const docks = await prisma.dock.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(docks);
}
