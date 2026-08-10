import { prisma } from "@/lib/prisma";

export type DockUtilization = {
  dockId: string;
  dockName: string;
  bookingCount: number;
  bookedMs: number;
  totalMs: number;
  utilization: number; // 0-1
};

/**
 * Shared by both utilization API routes and the /staff/analytics dashboard —
 * previously each route computed this overlap math inline, independently.
 */
export async function computeUtilization(
  rangeStart: Date,
  rangeEnd: Date,
  filter?: { dockId?: string; carrierName?: string; warehouseId?: string },
): Promise<DockUtilization[]> {
  const rangeMs = rangeEnd.getTime() - rangeStart.getTime();

  const docks = await prisma.dock.findMany({
    where: {
      ...(filter?.dockId ? { id: filter.dockId } : {}),
      ...(filter?.warehouseId ? { warehouseId: filter.warehouseId } : {}),
    },
    orderBy: { name: "asc" },
  });

  const bookings = await prisma.booking.findMany({
    where: {
      ...(filter?.dockId ? { dockId: filter.dockId } : {}),
      ...(filter?.carrierName ? { carrier: { name: filter.carrierName } } : {}),
      ...(filter?.warehouseId ? { dock: { warehouseId: filter.warehouseId } } : {}),
      startTime: { lt: rangeEnd },
      endTime: { gt: rangeStart },
    },
  });

  const bookedMsByDock = new Map<string, number>();
  const countByDock = new Map<string, number>();
  for (const b of bookings) {
    const overlapStart = b.startTime > rangeStart ? b.startTime : rangeStart;
    const overlapEnd = b.endTime < rangeEnd ? b.endTime : rangeEnd;
    const ms = overlapEnd.getTime() - overlapStart.getTime();
    bookedMsByDock.set(b.dockId, (bookedMsByDock.get(b.dockId) ?? 0) + ms);
    countByDock.set(b.dockId, (countByDock.get(b.dockId) ?? 0) + 1);
  }

  // Matches the by-carrier endpoint's existing behavior: carrier-scoped with no
  // explicit dock only returns docks that carrier actually booked, not every dock.
  const relevantDocks =
    filter?.carrierName && !filter?.dockId ? docks.filter((d) => bookedMsByDock.has(d.id)) : docks;

  return relevantDocks.map((dock) => ({
    dockId: dock.id,
    dockName: dock.name,
    bookingCount: countByDock.get(dock.id) ?? 0,
    bookedMs: bookedMsByDock.get(dock.id) ?? 0,
    totalMs: rangeMs,
    utilization: rangeMs > 0 ? (bookedMsByDock.get(dock.id) ?? 0) / rangeMs : 0,
  }));
}

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export type DockUtilizationTrend = {
  dockId: string;
  dockName: string;
  days: { date: string; utilization: number; bookingCount: number }[];
};

/**
 * Trailing-window trend, separate from computeUtilization rather than N calls
 * to it — fetches the whole window's bookings once and buckets booked-ms by
 * [dockId, dayIndex] in memory instead of days*docks separate query pairs.
 * Not optimized for huge ranges/booking volumes (loops all numDays per
 * booking) — acceptable at this app's scale, same as everywhere else here.
 */
export async function computeUtilizationTrend(
  endDate: Date, // inclusive last day of the window, 00:00 UTC boundary
  numDays: number,
  filter?: { carrierName?: string; warehouseId?: string },
): Promise<DockUtilizationTrend[]> {
  const dayMs = 24 * 60 * 60 * 1000;
  const windowStart = new Date(endDate.getTime() - (numDays - 1) * dayMs);
  const windowEnd = new Date(endDate.getTime() + dayMs);

  const docks = await prisma.dock.findMany({
    where: filter?.warehouseId ? { warehouseId: filter.warehouseId } : undefined,
    orderBy: { name: "asc" },
  });

  const bookings = await prisma.booking.findMany({
    where: {
      ...(filter?.carrierName ? { carrier: { name: filter.carrierName } } : {}),
      ...(filter?.warehouseId ? { dock: { warehouseId: filter.warehouseId } } : {}),
      startTime: { lt: windowEnd },
      endTime: { gt: windowStart },
    },
    select: { dockId: true, startTime: true, endTime: true },
  });

  const bookedMsByDockDay = new Map<string, number>(); // key: `${dockId}|${dayIndex}`
  const bookingCountByDockDay = new Map<string, number>();
  for (const b of bookings) {
    for (let i = 0; i < numDays; i++) {
      const dayStart = new Date(windowStart.getTime() + i * dayMs);
      const dayEnd = new Date(dayStart.getTime() + dayMs);
      const overlapStart = b.startTime > dayStart ? b.startTime : dayStart;
      const overlapEnd = b.endTime < dayEnd ? b.endTime : dayEnd;
      const ms = overlapEnd.getTime() - overlapStart.getTime();
      if (ms > 0) {
        const key = `${b.dockId}|${i}`;
        bookedMsByDockDay.set(key, (bookedMsByDockDay.get(key) ?? 0) + ms);
        bookingCountByDockDay.set(key, (bookingCountByDockDay.get(key) ?? 0) + 1);
      }
    }
  }

  // Same "only relevant docks" behavior as computeUtilization: carrier-filtered
  // only shows docks that carrier booked at least once somewhere in the window.
  const dockHasBooking = new Set(bookings.map((b) => b.dockId));
  const relevantDocks = filter?.carrierName ? docks.filter((d) => dockHasBooking.has(d.id)) : docks;

  return relevantDocks.map((dock) => ({
    dockId: dock.id,
    dockName: dock.name,
    days: Array.from({ length: numDays }, (_, i) => ({
      date: toISODate(new Date(windowStart.getTime() + i * dayMs)),
      utilization: (bookedMsByDockDay.get(`${dock.id}|${i}`) ?? 0) / dayMs,
      bookingCount: bookingCountByDockDay.get(`${dock.id}|${i}`) ?? 0,
    })),
  }));
}
