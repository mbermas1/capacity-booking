import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getStaffMember } from "@/lib/staff-session";
import { accountWhereClause, canViewReports, getWarehouseScope, warehouseWhereClause } from "@/lib/staff-roles";
import { normalizeCarrierName } from "@/lib/carrier-identity";
import { computeUtilization, computeUtilizationTrend } from "@/lib/utilization";
import { computeDockDwellStats, computeDockDwellTrend } from "@/lib/dock-dwell";
import { computeCarrierScore, computeCarrierScoreTrend, type CarrierScore } from "@/lib/carrier-score";

const TREND_DAY_OPTIONS = [7, 14, 30] as const;
const DEFAULT_TREND_DAYS = 14;

const TIER_STYLES: Record<CarrierScore["tier"], string> = {
  TRUSTED: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  STANDARD: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  FLAGGED: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  INSUFFICIENT_DATA: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

const TIER_LABELS: Record<CarrierScore["tier"], string> = {
  TRUSTED: "Trusted",
  STANDARD: "Standard",
  FLAGGED: "Flagged",
  INSUFFICIENT_DATA: "Not enough history",
};

function ComponentTrendRow({
  label,
  points,
}: {
  label: string;
  points: { periodStart: string; periodEnd: string; value: number | null }[];
}) {
  return (
    <div>
      <span className="text-xs text-zinc-500 dark:text-zinc-400">{label}</span>
      <div className="flex h-6 items-end gap-1">
        {points.map((p) => (
          <div
            key={p.periodStart}
            title={`${p.periodStart} – ${p.periodEnd}: ${
              p.value !== null ? `${Math.round(p.value)}%` : "insufficient data"
            }`}
            className={`flex-1 rounded-t ${p.value !== null ? "bg-foreground" : "bg-zinc-200 dark:bg-zinc-700"}`}
            style={{ height: `${p.value !== null ? Math.max(2, Math.round(p.value)) : 2}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseDateParam(value: string | undefined): Date {
  if (value) {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function parseDaysParam(value: string | undefined): number {
  const parsed = Number(value);
  return TREND_DAY_OPTIONS.includes(parsed as (typeof TREND_DAY_OPTIONS)[number]) ? parsed : DEFAULT_TREND_DAYS;
}

function formatDuration(ms: number): string {
  const totalMinutes = Math.round(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

function buildQuery(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export default async function StaffAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; carrierName?: string; days?: string }>;
}) {
  const staff = await getStaffMember();
  if (!staff) return null;
  if (!canViewReports(staff.role)) {
    return <p className="text-sm text-zinc-600 dark:text-zinc-400">You don&apos;t have access to this page.</p>;
  }
  const scope = getWarehouseScope(staff);
  const multiWarehouse = scope === null || scope.length > 1;

  const { date: dateParam, carrierName: carrierNameParam, days: daysParam } = await searchParams;
  const carrierName = carrierNameParam?.trim() || undefined;
  const trendDays = parseDaysParam(daysParam);

  const dayStart = parseDateParam(dateParam);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const dateStr = toISODate(dayStart);

  const prevDate = toISODate(new Date(dayStart.getTime() - 24 * 60 * 60 * 1000));
  const nextDate = toISODate(new Date(dayStart.getTime() + 24 * 60 * 60 * 1000));

  const trendWindowStart = toISODate(new Date(dayStart.getTime() - (trendDays - 1) * 24 * 60 * 60 * 1000));

  const [stats, carriers, trend, allDocks] = await Promise.all([
    computeUtilization(dayStart, dayEnd, { carrierName, warehouseId: warehouseWhereClause(staff) }),
    prisma.carrier.findMany({ where: { accountId: accountWhereClause(staff) }, orderBy: { name: "asc" }, select: { name: true } }),
    computeUtilizationTrend(dayStart, trendDays, { carrierName, warehouseId: warehouseWhereClause(staff) }),
    prisma.dock.findMany({
      where: { warehouseId: warehouseWhereClause(staff) },
      orderBy: { name: "asc" },
      include: { warehouse: { select: { name: true } } },
    }),
  ]);

  const dwellStats = new Map(
    await Promise.all(allDocks.map(async (d) => [d.id, await computeDockDwellStats(d.id)] as const)),
  );
  const dwellTrends = new Map(
    await Promise.all(allDocks.map(async (d) => [d.id, await computeDockDwellTrend(d.id)] as const)),
  );

  let filteredCarrier: { id: string; name: string } | null = null;
  let carrierScore: CarrierScore | null = null;
  let carrierScoreTrend: Awaited<ReturnType<typeof computeCarrierScoreTrend>> | null = null;
  if (carrierName) {
    filteredCarrier = await prisma.carrier.findFirst({
      where: { nameKey: normalizeCarrierName(carrierName), accountId: accountWhereClause(staff) },
      select: { id: true, name: true },
    });
    if (filteredCarrier) {
      [carrierScore, carrierScoreTrend] = await Promise.all([
        computeCarrierScore(filteredCarrier.id),
        computeCarrierScoreTrend(filteredCarrier.id),
      ]);
    }
  }

  const totalBookedMs = stats.reduce((sum, s) => sum + s.bookedMs, 0);
  const totalCapacityMs = stats.reduce((sum, s) => sum + s.totalMs, 0);
  const totalBookings = stats.reduce((sum, s) => sum + s.bookingCount, 0);
  const warehousePct = totalCapacityMs > 0 ? Math.round((totalBookedMs / totalCapacityMs) * 100) : 0;

  const warehouseTrend =
    trend.length > 0
      ? Array.from({ length: trendDays }, (_, i) => {
          const dayUtilizations = trend.map((dock) => dock.days[i].utilization);
          return {
            date: trend[0].days[i].date,
            utilization: dayUtilizations.reduce((a, b) => a + b, 0) / dayUtilizations.length,
            bookingCount: trend.reduce((sum, dock) => sum + dock.days[i].bookingCount, 0),
          };
        })
      : [];
  const warehouseMaxCount = Math.max(1, ...warehouseTrend.map((d) => d.bookingCount));

  return (
    <div className="flex flex-col gap-8">
      <section>
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-black dark:text-zinc-50">Dock Utilization</h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {multiWarehouse ? "All locations" : staff.warehouse?.name} on {dateStr} (UTC)
              {carrierName ? ` · ${carrierName}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/staff/analytics${buildQuery({ date: prevDate, carrierName, days: String(trendDays) })}`}
              className="flex h-9 items-center justify-center rounded-full border border-black/[.08] px-4 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
            >
              ← Prev
            </Link>
            <form action="/staff/analytics" className="flex items-center gap-2">
              <input type="hidden" name="days" value={trendDays} />
              <input
                type="date"
                name="date"
                defaultValue={dateStr}
                className="h-9 rounded-full border border-black/[.08] bg-white px-4 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
              />
              <input
                type="text"
                name="carrierName"
                list="carrier-names"
                defaultValue={carrierName ?? ""}
                placeholder="All carriers"
                className="h-9 w-40 rounded-full border border-black/[.08] bg-white px-4 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
              />
              <datalist id="carrier-names">
                {carriers.map((c) => (
                  <option key={c.name} value={c.name} />
                ))}
              </datalist>
              <button
                type="submit"
                className="h-9 rounded-full bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
              >
                Go
              </button>
            </form>
            <Link
              href={`/staff/analytics${buildQuery({ date: nextDate, carrierName, days: String(trendDays) })}`}
              className="flex h-9 items-center justify-center rounded-full border border-black/[.08] px-4 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
            >
              Next →
            </Link>
          </div>
        </div>

        {stats.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {carrierName ? "No bookings for that carrier on this date." : "No docks configured yet."}
          </p>
        ) : (
          <>
            <div className="mb-3 flex flex-col gap-2 rounded-2xl border border-black/[.08] bg-zinc-50 p-3 dark:border-white/[.145] dark:bg-zinc-900">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold text-black dark:text-zinc-50">Warehouse-wide</span>
                <span className="font-mono text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                  {totalBookings} booking{totalBookings === 1 ? "" : "s"} · {formatDuration(totalBookedMs)} booked ·{" "}
                  {warehousePct}%
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                <div className="h-full rounded-full bg-foreground" style={{ width: `${Math.min(100, warehousePct)}%` }} />
              </div>
            </div>
            <ul className="flex flex-col divide-y divide-black/[.06] rounded-2xl border border-black/[.08] bg-white px-4 dark:divide-white/[.08] dark:border-white/[.145] dark:bg-[#0a0a0a]">
            {stats.map((stat) => {
              const pct = Math.round(stat.utilization * 100);
              return (
                <li key={stat.dockId} className="flex flex-col gap-2 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-black dark:text-zinc-50">{stat.dockName}</span>
                    <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                      {stat.bookingCount} booking{stat.bookingCount === 1 ? "" : "s"} · {formatDuration(stat.bookedMs)} booked ·{" "}
                      {pct}%
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-foreground"
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                </li>
              );
            })}
            </ul>
          </>
        )}
      </section>

      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-medium text-black dark:text-zinc-50">Trends</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {trendWindowStart} – {dateStr} (UTC)
            </p>
          </div>
          <div className="flex items-center gap-2">
            {TREND_DAY_OPTIONS.map((n) => (
              <Link
                key={n}
                href={`/staff/analytics${buildQuery({ date: dateStr, carrierName, days: String(n) })}`}
                className={`flex h-8 items-center justify-center rounded-full border px-3 text-xs font-medium transition-colors ${
                  n === trendDays
                    ? "border-foreground bg-foreground text-background"
                    : "border-black/[.08] hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
                }`}
              >
                {n}d
              </Link>
            ))}
          </div>
        </div>

        {trend.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {carrierName ? "No bookings for that carrier in this window." : "No docks configured yet."}
          </p>
        ) : (
          <>
            <div className="mb-3 flex flex-col gap-2 rounded-2xl border border-black/[.08] bg-zinc-50 p-3 dark:border-white/[.145] dark:bg-zinc-900">
              <span className="text-sm font-semibold text-black dark:text-zinc-50">Warehouse-wide</span>
              <div className="flex h-10 items-end gap-0.5">
                {warehouseTrend.map((d) => (
                  <div
                    key={d.date}
                    title={`${d.date}: ${Math.round(d.utilization * 100)}%`}
                    className="flex-1 rounded-t bg-foreground"
                    style={{ height: `${Math.max(2, Math.round(d.utilization * 100))}%` }}
                  />
                ))}
              </div>
              <div className="flex h-5 items-end gap-0.5">
                {warehouseTrend.map((d) => (
                  <div
                    key={d.date}
                    title={`${d.date}: ${d.bookingCount} booking${d.bookingCount === 1 ? "" : "s"}`}
                    className="flex-1 rounded-t bg-zinc-400 dark:bg-zinc-500"
                    style={{ height: `${Math.max(2, Math.round((d.bookingCount / warehouseMaxCount) * 100))}%` }}
                  />
                ))}
              </div>
            </div>
          <ul className="flex flex-col divide-y divide-black/[.06] rounded-2xl border border-black/[.08] bg-white px-4 dark:divide-white/[.08] dark:border-white/[.145] dark:bg-[#0a0a0a]">
            {trend.map((dock) => {
              const dockMaxCount = Math.max(1, ...dock.days.map((d) => d.bookingCount));
              return (
              <li key={dock.dockId} className="flex flex-col gap-2 py-3">
                <span className="text-sm font-medium text-black dark:text-zinc-50">{dock.dockName}</span>
                <div className="flex h-10 items-end gap-0.5">
                  {dock.days.map((d) => (
                    <div
                      key={d.date}
                      title={`${d.date}: ${Math.round(d.utilization * 100)}%`}
                      className="flex-1 rounded-t bg-foreground"
                      style={{ height: `${Math.max(2, Math.round(d.utilization * 100))}%` }}
                    />
                  ))}
                </div>
                <div className="flex h-5 items-end gap-0.5">
                  {dock.days.map((d) => (
                    <div
                      key={d.date}
                      title={`${d.date}: ${d.bookingCount} booking${d.bookingCount === 1 ? "" : "s"}`}
                      className="flex-1 rounded-t bg-zinc-400 dark:bg-zinc-500"
                      style={{ height: `${Math.max(2, Math.round((d.bookingCount / dockMaxCount) * 100))}%` }}
                    />
                  ))}
                </div>
              </li>
              );
            })}
          </ul>
          </>
        )}
      </section>

      {carrierScore && carrierScoreTrend && filteredCarrier && (
        <section className="rounded-2xl border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-[#0a0a0a]">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-medium text-black dark:text-zinc-50">
              Carrier Score — {filteredCarrier.name}
            </h2>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TIER_STYLES[carrierScore.tier]}`}>
              {TIER_LABELS[carrierScore.tier]}
            </span>
            {carrierScore.overall !== null && (
              <span className="font-mono text-sm text-zinc-500 dark:text-zinc-400">
                {Math.round(carrierScore.overall)}/100
              </span>
            )}
          </div>
          <ul className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
            <li>
              On-time arrivals: {carrierScore.onTime.value !== null ? `${Math.round(carrierScore.onTime.value)}%` : "—"} (
              {carrierScore.onTime.detail})
            </li>
            <li>
              No-shows:{" "}
              {carrierScore.noShow.value !== null ? `${Math.round(100 - carrierScore.noShow.value)}%` : "—"} (
              {carrierScore.noShow.detail})
            </li>
            <li>
              Dwell efficiency: {carrierScore.dwell.value !== null ? `${Math.round(carrierScore.dwell.value)}%` : "—"} (
              {carrierScore.dwell.detail})
            </li>
            <li>
              Cancellations:{" "}
              {carrierScore.cancellation.value !== null ? `${Math.round(100 - carrierScore.cancellation.value)}%` : "—"} (
              {carrierScore.cancellation.detail})
            </li>
          </ul>
          <div className="mt-3">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Score history (last {carrierScoreTrend.length} weeks)
            </span>
            <div className="mt-2 flex h-10 items-end gap-1">
              {carrierScoreTrend.map((bucket) => (
                <div
                  key={bucket.periodStart}
                  title={`${bucket.periodStart} – ${bucket.periodEnd}: ${
                    bucket.overall !== null ? `${Math.round(bucket.overall)}/100` : "insufficient data"
                  }`}
                  className={`flex-1 rounded-t ${
                    bucket.overall !== null ? "bg-foreground" : "bg-zinc-200 dark:bg-zinc-700"
                  }`}
                  style={{ height: `${bucket.overall !== null ? Math.max(2, Math.round(bucket.overall)) : 2}%` }}
                />
              ))}
            </div>
            <div className="mt-3 flex flex-col gap-2">
              <ComponentTrendRow
                label="On-time"
                points={carrierScoreTrend.map((b) => ({ ...b, value: b.onTime.value }))}
              />
              <ComponentTrendRow
                label="No-shows"
                points={carrierScoreTrend.map((b) => ({
                  ...b,
                  value: b.noShow.value !== null ? 100 - b.noShow.value : null,
                }))}
              />
              <ComponentTrendRow
                label="Dwell efficiency"
                points={carrierScoreTrend.map((b) => ({ ...b, value: b.dwell.value }))}
              />
              <ComponentTrendRow
                label="Cancellations"
                points={carrierScoreTrend.map((b) => ({
                  ...b,
                  value: b.cancellation.value !== null ? 100 - b.cancellation.value : null,
                }))}
              />
            </div>
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-4 text-lg font-medium text-black dark:text-zinc-50">Dwell Time</h2>
        {allDocks.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">No docks configured yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-black/[.06] rounded-2xl border border-black/[.08] bg-white px-4 dark:divide-white/[.08] dark:border-white/[.145] dark:bg-[#0a0a0a]">
            {allDocks.map((dock) => {
              const dwell = dwellStats.get(dock.id)!;
              const dwellTrend = dwellTrends.get(dock.id)!;
              const maxDwell = Math.max(1, ...dwellTrend.map((b) => b.averageDwellMinutes ?? 0));
              return (
                <li key={dock.id} className="flex flex-col gap-2 py-3">
                  <span className="text-sm font-medium text-black dark:text-zinc-50">
                    {multiWarehouse && `${dock.warehouse.name} · `}
                    {dock.name}
                  </span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {dwell.averageDwellMinutes !== null
                      ? `Avg dwell: ${Math.round(dwell.averageDwellMinutes)} min (scheduled: ${Math.round(dwell.averageScheduledMinutes!)} min) · ${dwell.sampleSize} completed bookings`
                      : "Not enough completed bookings yet for a dwell-time average"}
                  </span>
                  <div className="flex h-10 items-end gap-0.5">
                    {dwellTrend.map((b) => (
                      <div
                        key={b.periodStart}
                        title={
                          b.averageDwellMinutes !== null
                            ? `${b.periodStart} – ${b.periodEnd}: avg ${Math.round(b.averageDwellMinutes)} min vs ${Math.round(b.averageScheduledMinutes!)} min scheduled`
                            : `${b.periodStart} – ${b.periodEnd}: insufficient data`
                        }
                        className={`flex-1 rounded-t ${
                          b.averageDwellMinutes !== null ? "bg-foreground" : "bg-zinc-200 dark:bg-zinc-700"
                        }`}
                        style={{
                          height: `${
                            b.averageDwellMinutes !== null
                              ? Math.max(2, Math.round((b.averageDwellMinutes / maxDwell) * 100))
                              : 2
                          }%`,
                        }}
                      />
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
