import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStaffMember } from "@/lib/staff-session";
import { canAccessWarehouse, canManageCapacityRules } from "@/lib/staff-roles";

type HoursEntry = {
  dayOfWeek?: unknown;
  closed?: unknown;
  openTime?: unknown;
  closeTime?: unknown;
};

function isValidHHMM(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const staff = await getStaffMember();
  if (!staff) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!canManageCapacityRules(staff.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: dockId } = await params;

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
      { error: "Validation failed", details: ["Request body must be an array of hours entries"] },
      { status: 400 },
    );
  }

  const errors: string[] = [];
  const entries = body as HoursEntry[];
  const parsed: { dayOfWeek: number; closed: boolean; openTime: string | null; closeTime: string | null }[] = [];
  const seenDays = new Set<number>();

  entries.forEach((entry, index) => {
    const itemErrors: string[] = [];

    if (
      typeof entry?.dayOfWeek !== "number" ||
      !Number.isInteger(entry.dayOfWeek) ||
      entry.dayOfWeek < 0 ||
      entry.dayOfWeek > 6
    ) {
      itemErrors.push(`hours[${index}].dayOfWeek must be an integer between 0 (Sunday) and 6 (Saturday)`);
    } else if (seenDays.has(entry.dayOfWeek)) {
      itemErrors.push(`hours[${index}].dayOfWeek ${entry.dayOfWeek} is duplicated`);
    } else {
      seenDays.add(entry.dayOfWeek);
    }

    const closed = entry?.closed === true;
    if (entry?.closed !== undefined && typeof entry.closed !== "boolean") {
      itemErrors.push(`hours[${index}].closed must be a boolean`);
    }

    let openTime: string | null = null;
    let closeTime: string | null = null;
    if (!closed && (entry?.openTime !== undefined || entry?.closeTime !== undefined)) {
      if (!isValidHHMM(entry.openTime)) itemErrors.push(`hours[${index}].openTime must be "HH:MM"`);
      else openTime = entry.openTime;

      if (!isValidHHMM(entry.closeTime)) itemErrors.push(`hours[${index}].closeTime must be "HH:MM"`);
      else closeTime = entry.closeTime;
    }

    errors.push(...itemErrors);

    if (itemErrors.length === 0 && typeof entry.dayOfWeek === "number") {
      parsed.push({ dayOfWeek: entry.dayOfWeek, closed, openTime, closeTime });
    }
  });

  if (errors.length > 0) {
    return NextResponse.json({ error: "Validation failed", details: errors }, { status: 400 });
  }

  const dock = await prisma.dock.findUnique({ where: { id: dockId } });
  if (!dock) {
    return NextResponse.json({ error: "Dock not found" }, { status: 404 });
  }
  if (!canAccessWarehouse(staff, dock.warehouseId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.$transaction(async (tx) => {
    // Days omitted from the payload revert to "unrestricted" — delete any existing row for them.
    await tx.dockOperatingHours.deleteMany({
      where: { dockId, dayOfWeek: { notIn: [...seenDays] } },
    });

    for (const entry of parsed) {
      await tx.dockOperatingHours.upsert({
        where: { dockId_dayOfWeek: { dockId, dayOfWeek: entry.dayOfWeek } },
        create: { dockId, ...entry },
        update: entry,
      });
    }
  });

  const hours = await prisma.dockOperatingHours.findMany({ where: { dockId }, orderBy: { dayOfWeek: "asc" } });
  return NextResponse.json(hours);
}
