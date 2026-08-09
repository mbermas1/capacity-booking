import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const docks = await prisma.dock.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(docks);
}

type CreateDockBody = {
  name?: unknown;
  location?: unknown;
  equipmentType?: unknown;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function POST(request: NextRequest) {
  let body: CreateDockBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON" },
      { status: 400 },
    );
  }

  const errors: string[] = [];

  if (!isNonEmptyString(body.name)) errors.push("name is required");
  if (!isNonEmptyString(body.location)) errors.push("location is required");
  if (!isNonEmptyString(body.equipmentType)) errors.push("equipmentType is required");

  if (errors.length > 0) {
    return NextResponse.json({ error: "Validation failed", details: errors }, { status: 400 });
  }

  const dock = await prisma.dock.create({
    data: {
      name: (body.name as string).trim(),
      location: (body.location as string).trim(),
      equipmentType: (body.equipmentType as string).trim(),
    },
  });

  return NextResponse.json(dock, { status: 201 });
}
