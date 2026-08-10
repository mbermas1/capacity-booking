import { prisma } from "@/lib/prisma";
import { CARRIER_NAME_INCLUDE, withCarrierName } from "@/lib/booking-response";
import { checkOperatingHours } from "@/lib/booking-constraints";

export async function getDockAvailability(dockId: string, startTime: Date, endTime: Date) {
  const dock = await prisma.dock.findUnique({ where: { id: dockId } });
  if (!dock) return null;

  const conflicts = await prisma.booking.findMany({
    where: {
      dockId,
      startTime: { lt: endTime },
      endTime: { gt: startTime },
    },
    include: CARRIER_NAME_INCLUDE,
    orderBy: { startTime: "asc" },
  });

  return {
    available: conflicts.length < dock.capacity,
    capacity: dock.capacity,
    conflicts: conflicts.map(withCarrierName),
  };
}

/**
 * Public, unauthenticated availability check (used by the per-warehouse booking
 * link) — deliberately limited to operating hours + capacity, the only two rules
 * that don't depend on who's asking. Tags, commodity acceptance, buffer time, and
 * lead time are checked later, at staff approval, via the real createBooking().
 * Never returns booking or carrier details — only a boolean and a remaining count.
 */
export async function getPublicDockAvailability(dockId: string, startTime: Date, endTime: Date) {
  const dock = await prisma.dock.findUnique({ where: { id: dockId }, include: { operatingHours: true } });
  if (!dock) return null;

  if (checkOperatingHours(dock.operatingHours, startTime, endTime)) {
    return { available: false, remainingCapacity: 0 };
  }

  const overlappingCount = await prisma.booking.count({
    where: {
      dockId,
      startTime: { lt: endTime },
      endTime: { gt: startTime },
    },
  });

  const capacityLimit = Math.max(0, dock.capacity - (dock.reservedHighPrioritySlots ?? 0));
  const remainingCapacity = Math.max(0, capacityLimit - overlappingCount);

  return { available: remainingCapacity > 0, remainingCapacity };
}
