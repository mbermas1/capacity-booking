import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type BulkDockInput = {
  name?: unknown;
  location?: unknown;
  equipmentType?: unknown;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON" },
      { status: 400 },
    );
  }

  if (!Array.isArray(body)) {
    return NextResponse.json(
      { error: "Validation failed", details: ["Request body must be an array of docks"] },
      { status: 400 },
    );
  }

  if (body.length === 0) {
    return NextResponse.json(
      { error: "Validation failed", details: ["At least one dock must be provided"] },
      { status: 400 },
    );
  }

  const errors: string[] = [];
  const docksInput = body as BulkDockInput[];

  docksInput.forEach((item, index) => {
    if (!isNonEmptyString(item?.name)) errors.push(`docks[${index}].name is required`);
    if (!isNonEmptyString(item?.location)) errors.push(`docks[${index}].location is required`);
    if (!isNonEmptyString(item?.equipmentType)) errors.push(`docks[${index}].equipmentType is required`);
  });

  if (errors.length > 0) {
    return NextResponse.json({ error: "Validation failed", details: errors }, { status: 400 });
  }

  const docks = await prisma.$transaction(async (tx) => {
    const created = [];
    for (const item of docksInput) {
      created.push(
        await tx.dock.create({
          data: {
            name: (item.name as string).trim(),
            location: (item.location as string).trim(),
            equipmentType: (item.equipmentType as string).trim(),
          },
        }),
      );
    }
    return created;
  });

  return NextResponse.json({ docks }, { status: 201 });
}
