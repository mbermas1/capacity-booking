import { NextRequest, NextResponse } from "next/server";
import { getStaffMember } from "@/lib/staff-session";
import { computeDwellReport } from "@/lib/reports";
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
  const carrierName = searchParams.get("carrierName")?.trim() || undefined;

  if (!startInclusive || !endInclusive) {
    return NextResponse.json({ error: "start and end query parameters (YYYY-MM-DD) are required" }, { status: 400 });
  }

  const dayMs = 24 * 60 * 60 * 1000;
  const end = new Date(endInclusive.getTime() + dayMs);

  const rows = await computeDwellReport(startInclusive, end, { carrierName, warehouseId: staff.warehouseId });

  const csv = toCsv(
    ["Date", "Dock", "Carrier", "Reference", "Scheduled (min)", "Actual (min)", "Detention (min)", "Est. Cost"],
    rows.map((r) => [
      r.startTime.toISOString().slice(0, 10),
      r.dockName,
      r.carrierName,
      r.referenceNumber,
      r.scheduledMinutes,
      r.actualMinutes,
      r.detentionMinutes,
      r.detentionCost !== null ? r.detentionCost.toFixed(2) : "",
    ]),
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="dwell-report-${startParam}-${endParam}.csv"`,
    },
  });
}
