import { prisma } from "@/lib/prisma";

/** Same reasoning as lib/carrier-score.ts: don't imply a stable average from too little data. */
const MIN_SAMPLE_SIZE = 5;

export type DockDwellStats = {
  averageDwellMinutes: number | null;
  averageScheduledMinutes: number | null;
  sampleSize: number;
};

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Operational, dock-scoped sibling of the carrier-scoped dwell component in
 * carrier-score.ts — raw average minutes for capacity planning, not a
 * normalized fairness score. All-time, computed on read, no caching.
 */
export async function computeDockDwellStats(dockId: string): Promise<DockDwellStats> {
  const completed = await prisma.booking.findMany({
    where: { dockId, status: "COMPLETED", checkedInAt: { not: null }, completedAt: { not: null } },
    select: { startTime: true, endTime: true, checkedInAt: true, completedAt: true },
  });

  if (completed.length < MIN_SAMPLE_SIZE) {
    return { averageDwellMinutes: null, averageScheduledMinutes: null, sampleSize: completed.length };
  }

  return {
    averageDwellMinutes: average(completed.map((b) => (b.completedAt!.getTime() - b.checkedInAt!.getTime()) / 60000)),
    averageScheduledMinutes: average(completed.map((b) => (b.endTime.getTime() - b.startTime.getTime()) / 60000)),
    sampleSize: completed.length,
  };
}
