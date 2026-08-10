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

export async function computeCarrierScore(carrierId: string): Promise<CarrierScore> {
  const [bookings, cancellations] = await Promise.all([
    prisma.booking.findMany({
      where: { carrierId },
      select: { status: true, startTime: true, endTime: true, checkedInAt: true, completedAt: true },
    }),
    prisma.cancellationRecord.count({ where: { carrierId } }),
  ]);

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

  const components = { onTime, noShow, dwell, cancellation };
  const overall = weightedAverage(components);

  return { overall, tier: tierFor(overall), ...components };
}
