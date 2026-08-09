import { prisma } from "@/lib/prisma";
import { CARRIER_NAME_INCLUDE, withCarrierName } from "@/lib/booking-response";

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

  return { available: conflicts.length === 0, conflicts: conflicts.map(withCarrierName) };
}
