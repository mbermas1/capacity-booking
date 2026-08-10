import Link from "next/link";
import { getStaffMember } from "@/lib/staff-session";
import { canViewReports, getWarehouseScope, warehouseWhereClause } from "@/lib/staff-roles";
import { prisma } from "@/lib/prisma";
import { computeUtilizationReport } from "@/lib/reports";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RANGE_DAYS = 7;

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseDay(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** start/end are both inclusive from the user's point of view; returned `end` is the exclusive query boundary. */
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

export default async function UtilizationReportPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string; end?: string; carrierName?: string }>;
}) {
  const staff = await getStaffMember();
  if (!staff) return null;
  if (!canViewReports(staff.role)) {
    return <p className="text-sm text-zinc-600 dark:text-zinc-400">You don&apos;t have access to this page.</p>;
  }
  const scope = getWarehouseScope(staff);
  const multiWarehouse = scope === null || scope.length > 1;

  const { start: startParam, end: endParam, carrierName: carrierNameParam } = await searchParams;
  const carrierName = carrierNameParam?.trim() || undefined;
  const { start, end, endInclusive } = parseRange(startParam, endParam, DEFAULT_RANGE_DAYS);

  const [report, carriers] = await Promise.all([
    computeUtilizationReport(start, end, { carrierName, warehouseId: warehouseWhereClause(staff) }),
    prisma.carrier.findMany({ orderBy: { name: "asc" }, select: { name: true } }),
  ]);

  const csvHref = `/api/staff/reports/utilization/export${buildQuery({
    start: toISODate(start),
    end: toISODate(endInclusive),
    carrierName,
  })}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="no-print flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/staff/reports" className="text-sm text-zinc-500 hover:underline dark:text-zinc-400">
            ← Reports
          </Link>
          <h1 className="mt-1 text-xl font-semibold text-black dark:text-zinc-50">Utilization Report</h1>
        </div>
        <form action="/staff/reports/utilization" className="flex flex-wrap items-end gap-2">
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
          <div className="flex flex-col gap-1">
            <label htmlFor="carrierName" className="text-xs text-zinc-600 dark:text-zinc-400">
              Carrier
            </label>
            <input
              id="carrierName"
              type="text"
              name="carrierName"
              list="carrier-names"
              defaultValue={carrierName ?? ""}
              placeholder="All carriers"
              className="h-9 w-40 rounded-full border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            />
            <datalist id="carrier-names">
              {carriers.map((c) => (
                <option key={c.name} value={c.name} />
              ))}
            </datalist>
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
          To save as PDF, use your browser&rsquo;s Print (Ctrl/Cmd+P).
        </span>
      </div>

      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {multiWarehouse ? "All locations" : staff.warehouse?.name} · {toISODate(start)} – {toISODate(endInclusive)}{" "}
        (UTC)
        {carrierName ? ` · ${carrierName}` : ""}
      </p>

      {report.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {carrierName ? "No bookings for that carrier in this range." : "No docks configured yet."}
        </p>
      ) : (
        report.map((dock) => {
          const dates = Array.from(new Set(dock.cells.map((c) => c.date))).sort();
          const cellMap = new Map(dock.cells.map((c) => [`${c.date}|${c.hour}`, c]));
          const totalBookings = dock.cells.reduce((sum, c) => sum + c.bookingCount, 0);
          const avgUtilization =
            dock.cells.length > 0
              ? Math.round((dock.cells.reduce((sum, c) => sum + c.utilization, 0) / dock.cells.length) * 100)
              : 0;

          return (
            <div key={dock.dockId} className="break-inside-avoid">
              <h2 className="mb-1 text-lg font-medium text-black dark:text-zinc-50">{dock.dockName}</h2>
              <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
                Avg {avgUtilization}% utilization · {totalBookings} bookings over {dates.length} day
                {dates.length === 1 ? "" : "s"}
              </p>
              <div className="overflow-x-auto rounded-2xl border border-black/[.08] dark:border-white/[.145]">
                <table className="min-w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-zinc-50 dark:bg-zinc-900">
                      <th className="border border-black/[.06] px-2 py-1 text-left dark:border-white/[.08]">Hour</th>
                      {dates.map((d) => (
                        <th key={d} className="border border-black/[.06] px-2 py-1 text-right dark:border-white/[.08]">
                          {d}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: 24 }, (_, hour) => (
                      <tr key={hour}>
                        <td className="border border-black/[.06] px-2 py-1 font-mono dark:border-white/[.08]">
                          {String(hour).padStart(2, "0")}:00
                        </td>
                        {dates.map((d) => {
                          const cell = cellMap.get(`${d}|${hour}`);
                          const pct = cell ? Math.round(cell.utilization * 100) : 0;
                          return (
                            <td
                              key={d}
                              className="border border-black/[.06] px-2 py-1 text-right font-mono dark:border-white/[.08]"
                            >
                              {pct}%
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
