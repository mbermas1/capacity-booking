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
