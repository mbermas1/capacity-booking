import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStaffMember, getStaffSession } from "@/lib/staff-session";
import { canManageTagDefinitions } from "@/lib/staff-roles";
import { TagCategory, Prisma } from "@/app/generated/prisma/client";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function GET(request: NextRequest) {
  const session = await getStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const category = request.nextUrl.searchParams.get("category");
  const validCategories = Object.values(TagCategory) as string[];

  if (category !== null && !validCategories.includes(category)) {
    return NextResponse.json(
      { error: "Validation failed", details: [`category must be one of: ${validCategories.join(", ")}`] },
      { status: 400 },
    );
  }

  const tags = await prisma.tag.findMany({
    where: category !== null ? { category: category as TagCategory } : undefined,
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  return NextResponse.json(tags);
}

type CreateTagBody = {
  category?: unknown;
  name?: unknown;
  minDurationMinutes?: unknown;
};

export async function POST(request: NextRequest) {
  const staff = await getStaffMember();
  if (!staff) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!canManageTagDefinitions(staff.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: CreateTagBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON" },
      { status: 400 },
    );
  }

  const errors: string[] = [];
  const validCategories = Object.values(TagCategory) as string[];

  if (typeof body.category !== "string" || !validCategories.includes(body.category)) {
    errors.push(`category must be one of: ${validCategories.join(", ")}`);
  }
  if (!isNonEmptyString(body.name)) errors.push("name is required");

  let minDurationMinutes: number | undefined;
  if (body.minDurationMinutes !== undefined) {
    if (typeof body.minDurationMinutes !== "number" || !Number.isInteger(body.minDurationMinutes) || body.minDurationMinutes < 0) {
      errors.push("minDurationMinutes must be a non-negative integer");
    } else {
      minDurationMinutes = body.minDurationMinutes;
    }
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: "Validation failed", details: errors }, { status: 400 });
  }

  try {
    const tag = await prisma.tag.create({
      data: {
        category: body.category as TagCategory,
        name: (body.name as string).trim(),
        minDurationMinutes,
      },
    });

    return NextResponse.json(tag, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "A tag with this category and name already exists" }, { status: 409 });
    }

    console.error("Failed to create tag:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
