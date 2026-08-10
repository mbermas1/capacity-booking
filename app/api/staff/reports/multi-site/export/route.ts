import { NextRequest, NextResponse } from "next/server";
import { getStaffMember } from "@/lib/staff-session";
import { computeMultiSiteRollup } from "@/lib/reports";
import { toCsv } from "@/lib/csv";

function parseDay(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function GET(request: NextRequest) {
  const staff = await getStaffMember();
  if (!staff) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const startParam = searchParams.get("start");
  const endParam = searchParams.get("end");
  const startInclusive = parseDay(startParam);
  const endInclusive = parseDay(endParam);

  if (!startInclusive || !endInclusive) {
    return NextResponse.json({ error: "start and end query parameters (YYYY-MM-DD) are required" }, { status: 400 });
  }

  const dayMs = 24 * 60 * 60 * 1000;
  const end = new Date(endInclusive.getTime() + dayMs);

  const rows = await computeMultiSiteRollup(startInclusive, end);

  const csv = toCsv(
    ["Facility", "Docks", "Utilization %", "Avg Detention (min)"],
    rows.map((r) => [
      r.warehouseName,
      r.dockCount,
      r.utilization !== null ? Math.round(r.utilization * 10000) / 100 : "",
      r.avgDetentionMinutes !== null ? Math.round(r.avgDetentionMinutes) : "",
    ]),
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="multi-site-rollup-${startParam}-${endParam}.csv"`,
    },
  });
}
