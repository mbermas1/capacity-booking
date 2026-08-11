import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getStaffMember } from "@/lib/staff-session";
import { accountWhereClause, canCreateWarehouse } from "@/lib/staff-roles";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function GET() {
  const staff = await getStaffMember();
  if (!staff) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const warehouses = await prisma.warehouse.findMany({
    where: { accountId: accountWhereClause(staff) },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(warehouses);
}

type CreateWarehouseBody = {
  name?: unknown;
  location?: unknown;
  accountId?: unknown;
};

export async function POST(request: NextRequest) {
  const staff = await getStaffMember();
  if (!staff) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!canCreateWarehouse(staff.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: CreateWarehouseBody;
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
  if (!isNonEmptyString(body.accountId)) errors.push("accountId is required");

  if (errors.length > 0) {
    return NextResponse.json({ error: "Validation failed", details: errors }, { status: 400 });
  }

  const account = await prisma.account.findUnique({ where: { id: body.accountId as string } });
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const warehouse = await prisma.warehouse.create({
    data: {
      name: (body.name as string).trim(),
      location: (body.location as string).trim(),
      accountId: account.id,
      publicBookingSlug: randomBytes(16).toString("hex"),
    },
  });

  return NextResponse.json(warehouse, { status: 201 });
}
