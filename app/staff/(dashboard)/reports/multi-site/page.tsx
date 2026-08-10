import Link from "next/link";
import { getStaffMember } from "@/lib/staff-session";
import { canViewReports, getWarehouseScope } from "@/lib/staff-roles";
import { computeMultiSiteRollup } from "@/lib/reports";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RANGE_DAYS = 30;

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseDay(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseRange(startParam: string | undefined, endParam: string | undefined, defaultDays: number) {
  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const endInclusive = parseDay(endParam) ?? todayStart;
  const startInclusive = parseDay(startParam) ?? new Date(endInclusive.getTime() - (defaultDays - 1) * DAY_MS);
  return { start: startInclusive, end: new Date(endInclusive.getTime() + DAY_MS), endInclusive };
}

function buildQuery(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export default async function MultiSiteReportPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string; end?: string }>;
}) {
  const staff = await getStaffMember();
  if (!staff) return null;
  if (!canViewReports(staff.role)) {
    return <p className="text-sm text-zinc-600 dark:text-zinc-400">You don&apos;t have access to this page.</p>;
  }
  const scope = getWarehouseScope(staff);

  const { start: startParam, end: endParam } = await searchParams;
  const { start, end, endInclusive } = parseRange(startParam, endParam, DEFAULT_RANGE_DAYS);

  const rows = await computeMultiSiteRollup(start, end, scope === null ? undefined : { warehouseIds: scope });

  const csvHref = `/api/staff/reports/multi-site/export${buildQuery({
    start: toISODate(start),
    end: toISODate(endInclusive),
  })}`;

  const withUtilization = rows.filter((r) => r.utilization !== null);
  const bestUtilizationId = withUtilization.length > 0
    ? withUtilization.reduce((a, b) => (b.utilization! > a.utilization! ? b : a)).warehouseId
    : null;
  const worstUtilizationId = withUtilization.length > 0
    ? withUtilization.reduce((a, b) => (b.utilization! < a.utilization! ? b : a)).warehouseId
    : null;

  const withDwell = rows.filter((r) => r.avgDetentionMinutes !== null);
  const bestDwellId = withDwell.length > 0
    ? withDwell.reduce((a, b) => (b.avgDetentionMinutes! < a.avgDetentionMinutes! ? b : a)).warehouseId
    : null;
  const worstDwellId = withDwell.length > 0
    ? withDwell.reduce((a, b) => (b.avgDetentionMinutes! > a.avgDetentionMinutes! ? b : a)).warehouseId
    : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="no-print flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/staff/reports" className="text-sm text-zinc-500 hover:underline dark:text-zinc-400">
            ← Reports
          </Link>
          <h1 className="mt-1 text-xl font-semibold text-black dark:text-zinc-50">Multi-Site Rollup</h1>
        </div>
        <form action="/staff/reports/multi-site" className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="start" className="text-xs text-zinc-600 dark:text-zinc-400">
              Start
            </label>
            <input
              id="start"
              type="date"
              name="start"
              defaultValue={toISODate(start)}
              className="h-9 rounded-full border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="end" className="text-xs text-zinc-600 dark:text-zinc-400">
              End
            </label>
            <input
              id="end"
              type="date"
              name="end"
              defaultValue={toISODate(endInclusive)}
              className="h-9 rounded-full border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            />
          </div>
          <button
            type="submit"
            className="h-9 rounded-full bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            Go
          </button>
        </form>
      </div>

      <div className="no-print flex items-center gap-2">
        <a
          href={csvHref}
          className="flex h-9 items-center rounded-full border border-black/[.08] px-4 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
        >
          Export CSV
        </a>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          To save as PDF, use your browser&rsquo;s Print (Ctrl/Cmd+P).{" "}
          {scope === null
            ? `Shows every facility, not just ${staff.warehouse?.name}.`
            : "Shows the facilities assigned to your account."}
        </span>
      </div>

      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {toISODate(start)} – {toISODate(endInclusive)} (UTC) · {scope === null ? "all facilities" : "your facilities"}
      </p>

      {rows.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">No warehouses configured yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-black/[.08] dark:border-white/[.145]">
          <table className="min-w-full border-collapse text-xs">
            <thead>
              <tr className="bg-zinc-50 dark:bg-zinc-900">
                <th className="border border-black/[.06] px-2 py-1 text-left dark:border-white/[.08]">Facility</th>
                <th className="border border-black/[.06] px-2 py-1 text-right dark:border-white/[.08]">Docks</th>
                <th className="border border-black/[.06] px-2 py-1 text-right dark:border-white/[.08]">Utilization</th>
                <th className="border border-black/[.06] px-2 py-1 text-right dark:border-white/[.08]">Avg Detention (min)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.warehouseId}>
                  <td className="border border-black/[.06] px-2 py-1 dark:border-white/[.08]">
                    <div className="flex flex-wrap items-center gap-1">
                      {r.warehouseName}
                      {r.warehouseId === bestUtilizationId && (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-800 dark:bg-green-950 dark:text-green-300">
                          Best utilization
                        </span>
                      )}
                      {r.warehouseId === worstUtilizationId && bestUtilizationId !== worstUtilizationId && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-800 dark:bg-red-950 dark:text-red-300">
                          Needs attention
                        </span>
                      )}
                      {r.warehouseId === bestDwellId && (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-800 dark:bg-green-950 dark:text-green-300">
                          Best dwell
                        </span>
                      )}
                      {r.warehouseId === worstDwellId && bestDwellId !== worstDwellId && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-800 dark:bg-red-950 dark:text-red-300">
                          Longest dwell
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="border border-black/[.06] px-2 py-1 text-right font-mono dark:border-white/[.08]">
                    {r.dockCount}
                  </td>
                  <td className="border border-black/[.06] px-2 py-1 text-right font-mono dark:border-white/[.08]">
                    {r.utilization !== null ? `${Math.round(r.utilization * 100)}%` : "—"}
                  </td>
                  <td className="border border-black/[.06] px-2 py-1 text-right font-mono dark:border-white/[.08]">
                    {r.avgDetentionMinutes !== null ? Math.round(r.avgDetentionMinutes) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
