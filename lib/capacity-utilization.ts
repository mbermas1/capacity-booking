import { prisma } from "@/lib/prisma";

export type WarehouseLoad = {
  hourly: { hour: number; concurrentBookings: number }[]; // sampled at each UTC hour boundary today
  currentBookings: number; // sampled at `now`
};

/**
 * Reuses the exact concurrency model validateBookingSlot (lib/bookings.ts)
 * enforces — warehouse-wide overlap count, sampled at hour boundaries rather
 * than scanning for a true intra-hour peak, same simplification
 * activeLaborHeadcount already makes when checking a booking against a shift.
 */
export async function computeWarehouseLoad(warehouseId: string, dayStart: Date, now: Date): Promise<WarehouseLoad> {
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const bookings = await prisma.booking.findMany({
    where: { dock: { warehouseId }, startTime: { lt: dayEnd }, endTime: { gt: dayStart } },
    select: { startTime: true, endTime: true },
  });
  const countAt = (at: Date) => bookings.filter((b) => b.startTime <= at && b.endTime > at).length;
  return {
    hourly: Array.from({ length: 24 }, (_, hour) => ({
      hour,
      concurrentBookings: countAt(new Date(dayStart.getTime() + hour * 60 * 60 * 1000)),
    })),
    currentBookings: countAt(now),
  };
}
