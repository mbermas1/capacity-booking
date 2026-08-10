import { prisma } from "@/lib/prisma";

/**
 * Per-component minimum sample size before a component is considered scoreable.
 * Below this, the component reports `value: null` ("insufficient data") and is
 * excluded from the weighted overall rather than let a single booking swing a
 * carrier's score to an extreme.
 */
const MIN_SAMPLE_SIZE = 5;

/**
 * Named, fixed weights — no ML, no hidden model. Shown to neither carriers nor
 * staff in the UI (per "transparent about components, not necessarily exact
 * weighting"), but fully readable here for whoever needs the real formula.
 */
const WEIGHTS = {
  onTime: 0.3,
  noShow: 0.3,
  dwell: 0.2,
  cancellation: 0.2,
} as const;

export type ScoreComponent = {
  value: number | null; // 0-100, higher is better; null = insufficient data
  sampleSize: number;
  detail: string;
};

export type CarrierScore = {
  overall: number | null;
  tier: "TRUSTED" | "STANDARD" | "FLAGGED" | "INSUFFICIENT_DATA";
  onTime: ScoreComponent;
  noShow: ScoreComponent;
  dwell: ScoreComponent;
  cancellation: ScoreComponent;
};

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function toComponent(good: number, total: number, detail: string): ScoreComponent {
  if (total < MIN_SAMPLE_SIZE) {
    return { value: null, sampleSize: total, detail: total === 0 ? "no data yet" : detail };
  }
  return { value: (good / total) * 100, sampleSize: total, detail };
}

function toComponentFromRatio(ratio: number, sampleSize: number, detail: string): ScoreComponent {
  if (sampleSize < MIN_SAMPLE_SIZE) {
    return { value: null, sampleSize, detail: sampleSize === 0 ? "no completed bookings yet" : detail };
  }
  return { value: ratio * 100, sampleSize, detail };
}

function tierFor(overall: number | null): CarrierScore["tier"] {
  if (overall === null) return "INSUFFICIENT_DATA";
  if (overall >= 85) return "TRUSTED";
  if (overall >= 60) return "STANDARD";
  return "FLAGGED";
}

function weightedAverage(components: Omit<CarrierScore, "overall" | "tier">): number | null {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const key of Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]) {
    const value = components[key].value;
    if (value === null) continue;
    weightedSum += value * WEIGHTS[key];
    totalWeight += WEIGHTS[key];
  }

  return totalWeight === 0 ? null : weightedSum / totalWeight;
}

type BookingForScoring = {
  status: "SCHEDULED" | "CHECKED_IN" | "COMPLETED" | "NO_SHOW";
  startTime: Date;
  endTime: Date;
  checkedInAt: Date | null;
  completedAt: Date | null;
};

/**
 * The four-component formula, pulled out of computeCarrierScore so
 * computeCarrierScoreTrend can re-run the exact same logic per bucket instead
 * of duplicating it.
 */
function computeComponents(
  bookings: BookingForScoring[],
  cancellations: number,
): Omit<CarrierScore, "overall" | "tier"> {
  // On-time %: of bookings ever checked in, % checked in at/before the scheduled start.
  const checkedIn = bookings.filter((b) => b.checkedInAt !== null);
  const onTimeCount = checkedIn.filter((b) => b.checkedInAt! <= b.startTime).length;
  const onTime = toComponent(onTimeCount, checkedIn.length, `${onTimeCount}/${checkedIn.length} arrivals on time`);

  // No-show rate (inverted to "not a no-show" so higher stays "better" across every component):
  // of bookings that reached their scheduled window, % that weren't a no-show.
  const reached = bookings.filter((b) => b.status === "COMPLETED" || b.status === "CHECKED_IN" || b.status === "NO_SHOW");
  const noShowCount = reached.filter((b) => b.status === "NO_SHOW").length;
  const noShow = toComponent(reached.length - noShowCount, reached.length, `${noShowCount}/${reached.length} were no-shows`);

  // Dwell efficiency: scheduled duration / actual time on-site, capped at 1 so finishing
  // early or exactly on schedule both earn full credit.
  const completed = bookings.filter((b) => b.status === "COMPLETED" && b.checkedInAt !== null && b.completedAt !== null);
  const dwellRatios = completed.map((b) => {
    const scheduledMs = b.endTime.getTime() - b.startTime.getTime();
    const actualMs = Math.max(b.completedAt!.getTime() - b.checkedInAt!.getTime(), 1);
    return Math.min(1, scheduledMs / actualMs);
  });
  const avgScheduledMin = Math.round(average(completed.map((b) => (b.endTime.getTime() - b.startTime.getTime()) / 60000)));
  const avgActualMin = Math.round(
    average(completed.map((b) => (b.completedAt!.getTime() - b.checkedInAt!.getTime()) / 60000)),
  );
  const dwell = toComponentFromRatio(
    average(dwellRatios),
    completed.length,
    `avg ${avgActualMin} min on-site vs. ${avgScheduledMin} min scheduled`,
  );

  // Cancellation rate (inverted): of every booking attempt (cancelled + everything above),
  // % that weren't cancelled.
  const totalAttempts = bookings.length + cancellations;
  const cancellation = toComponent(bookings.length, totalAttempts, `${cancellations}/${totalAttempts} attempts cancelled`);

  return { onTime, noShow, dwell, cancellation };
}

export async function computeCarrierScore(carrierId: string): Promise<CarrierScore> {
  const [bookings, cancellations] = await Promise.all([
    prisma.booking.findMany({
      where: { carrierId },
      select: { status: true, startTime: true, endTime: true, checkedInAt: true, completedAt: true },
    }),
    prisma.cancellationRecord.count({ where: { carrierId } }),
  ]);

  const components = computeComponents(bookings, cancellations);
  const overall = weightedAverage(components);

  return { overall, tier: tierFor(overall), ...components };
}

export type ScoreTrendBucket = {
  periodStart: string;
  periodEnd: string;
  overall: number | null;
  tier: CarrierScore["tier"];
};

const TREND_BUCKET_DAYS = 7;
const TREND_NUM_BUCKETS = 8;

/**
 * Weekly (not daily) trailing buckets, re-running computeComponents per
 * bucket — daily buckets would hit MIN_SAMPLE_SIZE almost every day for most
 * carriers at this app's scale. Bucketed by the booking's scheduled
 * startTime (and CancellationRecord.originalStartTime for cancellations) —
 * the one consistent anchor across all four components.
 */
export async function computeCarrierScoreTrend(carrierId: string): Promise<ScoreTrendBucket[]> {
  const dayMs = 24 * 60 * 60 * 1000;
  const windowStart = new Date(Date.now() - TREND_NUM_BUCKETS * TREND_BUCKET_DAYS * dayMs);

  const [bookings, cancellationRecords] = await Promise.all([
    prisma.booking.findMany({
      where: { carrierId, startTime: { gte: windowStart } },
      select: { status: true, startTime: true, endTime: true, checkedInAt: true, completedAt: true },
    }),
    prisma.cancellationRecord.findMany({
      where: { carrierId, originalStartTime: { gte: windowStart } },
      select: { originalStartTime: true },
    }),
  ]);

  return Array.from({ length: TREND_NUM_BUCKETS }, (_, i) => {
    const bucketStart = new Date(windowStart.getTime() + i * TREND_BUCKET_DAYS * dayMs);
    const bucketEnd = new Date(bucketStart.getTime() + TREND_BUCKET_DAYS * dayMs);

    const bucketBookings = bookings.filter((b) => b.startTime >= bucketStart && b.startTime < bucketEnd);
    const bucketCancellations = cancellationRecords.filter(
      (c) => c.originalStartTime >= bucketStart && c.originalStartTime < bucketEnd,
    ).length;

    const overall = weightedAverage(computeComponents(bucketBookings, bucketCancellations));
    return {
      periodStart: bucketStart.toISOString().slice(0, 10),
      periodEnd: new Date(bucketEnd.getTime() - dayMs).toISOString().slice(0, 10),
      overall,
      tier: tierFor(overall),
    };
  });
}
