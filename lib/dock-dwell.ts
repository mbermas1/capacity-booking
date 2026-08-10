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

type CompletedBookingForDwell = { startTime: Date; endTime: Date; checkedInAt: Date; completedAt: Date };

/**
 * Pulled out of computeDockDwellStats so computeDockDwellTrend can re-run the
 * exact same logic per bucket instead of duplicating it (same pattern as
 * carrier-score.ts's computeComponents extraction).
 */
function computeDwellFromBookings(completed: CompletedBookingForDwell[]): DockDwellStats {
  if (completed.length < MIN_SAMPLE_SIZE) {
    return { averageDwellMinutes: null, averageScheduledMinutes: null, sampleSize: completed.length };
  }

  return {
    averageDwellMinutes: average(completed.map((b) => (b.completedAt.getTime() - b.checkedInAt.getTime()) / 60000)),
    averageScheduledMinutes: average(completed.map((b) => (b.endTime.getTime() - b.startTime.getTime()) / 60000)),
    sampleSize: completed.length,
  };
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

  return computeDwellFromBookings(completed as CompletedBookingForDwell[]);
}

export type DockDwellTrendBucket = { periodStart: string; periodEnd: string } & DockDwellStats;

const TREND_BUCKET_DAYS = 7;
const TREND_NUM_BUCKETS = 8;

/**
 * Weekly (not daily) trailing buckets, same reasoning as
 * computeCarrierScoreTrend — a single dock rarely completes enough bookings
 * in one day to clear MIN_SAMPLE_SIZE. Bucketed by the booking's scheduled
 * startTime, matching the anchor already used for the all-time stat.
 */
export async function computeDockDwellTrend(dockId: string): Promise<DockDwellTrendBucket[]> {
  const dayMs = 24 * 60 * 60 * 1000;
  const windowStart = new Date(Date.now() - TREND_NUM_BUCKETS * TREND_BUCKET_DAYS * dayMs);

  const completed = await prisma.booking.findMany({
    where: {
      dockId,
      status: "COMPLETED",
      checkedInAt: { not: null },
      completedAt: { not: null },
      startTime: { gte: windowStart },
    },
    select: { startTime: true, endTime: true, checkedInAt: true, completedAt: true },
  });

  return Array.from({ length: TREND_NUM_BUCKETS }, (_, i) => {
    const bucketStart = new Date(windowStart.getTime() + i * TREND_BUCKET_DAYS * dayMs);
    const bucketEnd = new Date(bucketStart.getTime() + TREND_BUCKET_DAYS * dayMs);
    const bucketBookings = completed.filter((b) => b.startTime >= bucketStart && b.startTime < bucketEnd);
    return {
      periodStart: bucketStart.toISOString().slice(0, 10),
      periodEnd: new Date(bucketEnd.getTime() - dayMs).toISOString().slice(0, 10),
      ...computeDwellFromBookings(bucketBookings as CompletedBookingForDwell[]),
    };
  });
}
