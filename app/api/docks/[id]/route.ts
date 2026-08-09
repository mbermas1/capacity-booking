import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";

type UpdateDockBody = {
  name?: unknown;
  location?: unknown;
  equipmentType?: unknown;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: UpdateDockBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON" },
      { status: 400 },
    );
  }

  const errors: string[] = [];
  const data: { name?: string; location?: string; equipmentType?: string } = {};

  if (body.name !== undefined) {
    if (!isNonEmptyString(body.name)) errors.push("name must be a non-empty string");
    else data.name = body.name.trim();
  }

  if (body.location !== undefined) {
    if (!isNonEmptyString(body.location)) errors.push("location must be a non-empty string");
    else data.location = body.location.trim();
  }

  if (body.equipmentType !== undefined) {
    if (!isNonEmptyString(body.equipmentType)) errors.push("equipmentType must be a non-empty string");
    else data.equipmentType = body.equipmentType.trim();
  }

  if (Object.keys(data).length === 0 && errors.length === 0) {
    errors.push("At least one of name, location, equipmentType must be provided");
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: "Validation failed", details: errors }, { status: 400 });
  }

  try {
    const dock = await prisma.dock.update({ where: { id }, data });
    return NextResponse.json(dock);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Dock not found" }, { status: 404 });
    }

    console.error("Failed to update dock:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
