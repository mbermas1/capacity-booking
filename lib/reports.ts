import { prisma } from "@/lib/prisma";
import { detectNoShowMany } from "@/lib/bookings";
import { computeUtilization } from "@/lib/utilization";

type ReportFilter = { warehouseId?: string | { in: string[] }; carrierName?: string };

// ---------------------------------------------------------------------------
// Utilization report — capacity used vs. available, by door/day/hour.
// ---------------------------------------------------------------------------

export type HourlyUtilizationCell = {
  date: string; // YYYY-MM-DD
  hour: number; // 0-23
  bookedMinutes: number;
  bookingCount: number;
  utilization: number; // 0-1
};

export type DockUtilizationReport = {
  dockId: string;
  dockName: string;
  cells: HourlyUtilizationCell[];
};

/**
 * Same overlap-math pattern as computeUtilizationTrend (lib/utilization.ts),
 * 1-hour buckets instead of 1-day. Not optimized for huge ranges (loops all
 * buckets per booking) — same accepted tradeoff as every other trend/report
 * computation in this app.
 */
export async function computeUtilizationReport(
  rangeStart: Date, // 00:00 UTC day boundary, inclusive
  rangeEnd: Date, // 00:00 UTC day boundary, exclusive
  filter?: ReportFilter,
): Promise<DockUtilizationReport[]> {
  const hourMs = 60 * 60 * 1000;
  const numHours = Math.round((rangeEnd.getTime() - rangeStart.getTime()) / hourMs);

  const docks = await prisma.dock.findMany({
    where: filter?.warehouseId ? { warehouseId: filter.warehouseId } : undefined,
    orderBy: { name: "asc" },
  });

  const bookings = await prisma.booking.findMany({
    where: {
      ...(filter?.carrierName ? { carrier: { name: filter.carrierName } } : {}),
      ...(filter?.warehouseId ? { dock: { warehouseId: filter.warehouseId } } : {}),
      startTime: { lt: rangeEnd },
      endTime: { gt: rangeStart },
    },
    select: { dockId: true, startTime: true, endTime: true },
  });

  const bookedMsByDockHour = new Map<string, number>();
  const countByDockHour = new Map<string, number>();
  for (const b of bookings) {
    for (let i = 0; i < numHours; i++) {
      const hourStart = new Date(rangeStart.getTime() + i * hourMs);
      const hourEnd = new Date(hourStart.getTime() + hourMs);
      const overlapStart = b.startTime > hourStart ? b.startTime : hourStart;
      const overlapEnd = b.endTime < hourEnd ? b.endTime : hourEnd;
      const ms = overlapEnd.getTime() - overlapStart.getTime();
      if (ms > 0) {
        const key = `${b.dockId}|${i}`;
        bookedMsByDockHour.set(key, (bookedMsByDockHour.get(key) ?? 0) + ms);
        countByDockHour.set(key, (countByDockHour.get(key) ?? 0) + 1);
      }
    }
  }

  const dockHasBooking = new Set(bookings.map((b) => b.dockId));
  const relevantDocks = filter?.carrierName ? docks.filter((d) => dockHasBooking.has(d.id)) : docks;

  return relevantDocks.map((dock) => ({
    dockId: dock.id,
    dockName: dock.name,
    cells: Array.from({ length: numHours }, (_, i) => {
      const hourStart = new Date(rangeStart.getTime() + i * hourMs);
      const key = `${dock.id}|${i}`;
      const bookedMs = bookedMsByDockHour.get(key) ?? 0;
      return {
        date: hourStart.toISOString().slice(0, 10),
        hour: hourStart.getUTCHours(),
        bookedMinutes: Math.round(bookedMs / 60000),
        bookingCount: countByDockHour.get(key) ?? 0,
        utilization: bookedMs / hourMs,
      };
    }),
  }));
}

// ---------------------------------------------------------------------------
// Dwell time / detention report — trend plus estimated detention cost.
// ---------------------------------------------------------------------------

export type DwellReportRow = {
  bookingId: string;
  dockId: string;
  dockName: string;
  carrierName: string;
  referenceNumber: string;
  startTime: Date;
  endTime: Date;
  scheduledMinutes: number;
  actualMinutes: number;
  detentionMinutes: number;
  detentionCost: number | null; // null = warehouse hasn't configured a detention rate
};

/**
 * Row-level by design — the printable report page aggregates this same
 * array (by day, by dock) rather than a second parallel function. Detention
 * cost is looked up per-row from its own dock's warehouse, so this works the
 * same whether filter.warehouseId scopes one warehouse, several (Facility
 * Manager's assigned set), or is omitted entirely (all warehouses).
 */
export async function computeDwellReport(
  rangeStart: Date,
  rangeEnd: Date,
  filter?: ReportFilter,
): Promise<DwellReportRow[]> {
  const bookings = await prisma.booking.findMany({
    where: {
      status: "COMPLETED",
      checkedInAt: { not: null },
      completedAt: { not: null },
      startTime: { gte: rangeStart, lt: rangeEnd },
      ...(filter?.carrierName ? { carrier: { name: filter.carrierName } } : {}),
      ...(filter?.warehouseId ? { dock: { warehouseId: filter.warehouseId } } : {}),
    },
    include: { dock: { select: { name: true, warehouseId: true } }, carrier: { select: { name: true } } },
    orderBy: { startTime: "asc" },
  });

  const warehouseIds = Array.from(new Set(bookings.map((b) => b.dock.warehouseId)));
  const warehouses =
    warehouseIds.length > 0
      ? await prisma.warehouse.findMany({
          where: { id: { in: warehouseIds } },
          select: { id: true, detentionRatePerHour: true, detentionFreeMinutes: true },
        })
      : [];
  const warehouseById = new Map(warehouses.map((w) => [w.id, w]));

  return bookings.map((b) => {
    const scheduledMinutes = Math.round((b.endTime.getTime() - b.startTime.getTime()) / 60000);
    const actualMinutes = Math.round((b.completedAt!.getTime() - b.checkedInAt!.getTime()) / 60000);
    const warehouse = warehouseById.get(b.dock.warehouseId);
    const freeMinutes = warehouse?.detentionFreeMinutes ?? 0;
    const rate = warehouse?.detentionRatePerHour ?? null;
    const detentionMinutes = Math.max(0, actualMinutes - freeMinutes);
    return {
      bookingId: b.id,
      dockId: b.dockId,
      dockName: b.dock.name,
      carrierName: b.carrier.name,
      referenceNumber: b.referenceNumber,
      startTime: b.startTime,
      endTime: b.endTime,
      scheduledMinutes,
      actualMinutes,
      detentionMinutes,
      detentionCost: rate !== null ? (detentionMinutes / 60) * rate : null,
    };
  });
}

// ---------------------------------------------------------------------------
// No-show / exception report — cancellations, late arrivals, missed windows.
// ---------------------------------------------------------------------------

export type ExceptionRow = {
  type: "CANCELLATION" | "LATE_ARRIVAL" | "NO_SHOW";
  dockName: string;
  carrierName: string;
  referenceNumber: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  detail: string;
};

function formatLeadTime(scheduledStart: Date, actionAt: Date): string {
  const diffMinutes = Math.round((scheduledStart.getTime() - actionAt.getTime()) / 60000);
  if (diffMinutes < 60) return `${diffMinutes} min before start`;
  const hours = Math.round(diffMinutes / 60);
  if (hours < 48) return `${hours}h before start`;
  return `${Math.round(hours / 24)}d before start`;
}

/**
 * Unions three sources into one sorted list. No-show candidates route
 * through detectNoShowMany first so status is fresh, same as every other
 * read path in this app.
 */
export async function computeExceptionReport(
  rangeStart: Date,
  rangeEnd: Date,
  filter?: ReportFilter,
): Promise<ExceptionRow[]> {
  const [cancellations, rawBookings] = await Promise.all([
    prisma.cancellationRecord.findMany({
      where: {
        originalStartTime: { gte: rangeStart, lt: rangeEnd },
        ...(filter?.carrierName ? { carrier: { name: filter.carrierName } } : {}),
        ...(filter?.warehouseId ? { dock: { warehouseId: filter.warehouseId } } : {}),
      },
      include: { dock: { select: { name: true } }, carrier: { select: { name: true } } },
    }),
    prisma.booking.findMany({
      where: {
        startTime: { gte: rangeStart, lt: rangeEnd },
        ...(filter?.carrierName ? { carrier: { name: filter.carrierName } } : {}),
        ...(filter?.warehouseId ? { dock: { warehouseId: filter.warehouseId } } : {}),
      },
      include: { dock: { select: { name: true } }, carrier: { select: { name: true } } },
    }),
  ]);

  const bookings = await detectNoShowMany(rawBookings);

  const rows: ExceptionRow[] = [];

  for (const c of cancellations) {
    rows.push({
      type: "CANCELLATION",
      dockName: c.dock.name,
      carrierName: c.carrier.name,
      referenceNumber: c.referenceNumber,
      scheduledStart: c.originalStartTime,
      scheduledEnd: c.originalEndTime,
      detail: `cancelled ${formatLeadTime(c.originalStartTime, c.cancelledAt)}`,
    });
  }

  for (const b of bookings) {
    if (b.status === "NO_SHOW") {
      rows.push({
        type: "NO_SHOW",
        dockName: b.dock.name,
        carrierName: b.carrier.name,
        referenceNumber: b.referenceNumber,
        scheduledStart: b.startTime,
        scheduledEnd: b.endTime,
        detail: "no-show",
      });
    } else if (b.checkedInAt && b.checkedInAt > b.startTime) {
      const lateMinutes = Math.round((b.checkedInAt.getTime() - b.startTime.getTime()) / 60000);
      rows.push({
        type: "LATE_ARRIVAL",
        dockName: b.dock.name,
        carrierName: b.carrier.name,
        referenceNumber: b.referenceNumber,
        scheduledStart: b.startTime,
        scheduledEnd: b.endTime,
        detail: `arrived ${lateMinutes} min late`,
      });
    }
  }

  return rows.sort((a, b) => a.scheduledStart.getTime() - b.scheduledStart.getTime());
}

// ---------------------------------------------------------------------------
// Multi-site rollup — compare utilization/dwell across facilities.
// ---------------------------------------------------------------------------

export type SiteRollupRow = {
  warehouseId: string;
  warehouseName: string;
  dockCount: number;
  utilization: number | null; // 0-1
  avgDetentionMinutes: number | null;
};

/**
 * SUPER_USER calls this unfiltered (every warehouse, every account); every other role
 * passes their getWarehouseScope() result so the rollup only compares sites within their
 * own Account that they can actually see.
 */
export async function computeMultiSiteRollup(
  rangeStart: Date,
  rangeEnd: Date,
  filter?: { warehouseIds?: string[] },
): Promise<SiteRollupRow[]> {
  const warehouses = await prisma.warehouse.findMany({
    where: filter?.warehouseIds ? { id: { in: filter.warehouseIds } } : undefined,
    include: { _count: { select: { docks: true } } },
    orderBy: { name: "asc" },
  });

  return Promise.all(
    warehouses.map(async (w) => {
      const [utilStats, dwellRows] = await Promise.all([
        computeUtilization(rangeStart, rangeEnd, { warehouseId: w.id }),
        computeDwellReport(rangeStart, rangeEnd, { warehouseId: w.id }),
      ]);

      const totalBookedMs = utilStats.reduce((sum, s) => sum + s.bookedMs, 0);
      const totalCapacityMs = utilStats.reduce((sum, s) => sum + s.totalMs, 0);

      return {
        warehouseId: w.id,
        warehouseName: w.name,
        dockCount: w._count.docks,
        utilization: totalCapacityMs > 0 ? totalBookedMs / totalCapacityMs : null,
        avgDetentionMinutes:
          dwellRows.length > 0
            ? dwellRows.reduce((sum, r) => sum + r.detentionMinutes, 0) / dwellRows.length
            : null,
      };
    }),
  );
}
