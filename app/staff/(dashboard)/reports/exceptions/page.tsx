import Link from "next/link";
import { getStaffMember } from "@/lib/staff-session";
import { prisma } from "@/lib/prisma";
import { computeExceptionReport, type ExceptionRow } from "@/lib/reports";
import { formatTime } from "@/lib/booking-display";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RANGE_DAYS = 30;

const TYPE_STYLES: Record<ExceptionRow["type"], string> = {
  CANCELLATION: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  LATE_ARRIVAL: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  NO_SHOW: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

const TYPE_LABELS: Record<ExceptionRow["type"], string> = {
  CANCELLATION: "Cancellation",
  LATE_ARRIVAL: "Late Arrival",
  NO_SHOW: "No-Show",
};

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

export default async function ExceptionReportPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string; end?: string; carrierName?: string }>;
}) {
  const staff = await getStaffMember();
  if (!staff) return null;

  const { start: startParam, end: endParam, carrierName: carrierNameParam } = await searchParams;
  const carrierName = carrierNameParam?.trim() || undefined;
  const { start, end, endInclusive } = parseRange(startParam, endParam, DEFAULT_RANGE_DAYS);

  const [rows, carriers] = await Promise.all([
    computeExceptionReport(start, end, { carrierName, warehouseId: staff.warehouseId }),
    prisma.carrier.findMany({ orderBy: { name: "asc" }, select: { name: true } }),
  ]);

  const csvHref = `/api/staff/reports/exceptions/export${buildQuery({
    start: toISODate(start),
    end: toISODate(endInclusive),
    carrierName,
  })}`;

  const counts = {
    CANCELLATION: rows.filter((r) => r.type === "CANCELLATION").length,
    LATE_ARRIVAL: rows.filter((r) => r.type === "LATE_ARRIVAL").length,
    NO_SHOW: rows.filter((r) => r.type === "NO_SHOW").length,
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="no-print flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/staff/reports" className="text-sm text-zinc-500 hover:underline dark:text-zinc-400">
            ← Reports
          </Link>
          <h1 className="mt-1 text-xl font-semibold text-black dark:text-zinc-50">No-Show / Exception Report</h1>
        </div>
        <form action="/staff/reports/exceptions" className="flex flex-wrap items-end gap-2">
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
        {staff.warehouse?.name} · {toISODate(start)} – {toISODate(endInclusive)} (UTC)
        {carrierName ? ` · ${carrierName}` : ""}
      </p>

      {rows.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">No exceptions in this range.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 rounded-2xl border border-black/[.08] bg-zinc-50 p-3 dark:border-white/[.145] dark:bg-zinc-900">
            <span className="text-sm font-semibold text-black dark:text-zinc-50">{rows.length} total ·</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_STYLES.CANCELLATION}`}>
              {counts.CANCELLATION} cancelled
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_STYLES.LATE_ARRIVAL}`}>
              {counts.LATE_ARRIVAL} late
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_STYLES.NO_SHOW}`}>
              {counts.NO_SHOW} no-show
            </span>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-black/[.08] dark:border-white/[.145]">
            <table className="min-w-full border-collapse text-xs">
              <thead>
                <tr className="bg-zinc-50 dark:bg-zinc-900">
                  <th className="border border-black/[.06] px-2 py-1 text-left dark:border-white/[.08]">Type</th>
                  <th className="border border-black/[.06] px-2 py-1 text-left dark:border-white/[.08]">Date</th>
                  <th className="border border-black/[.06] px-2 py-1 text-left dark:border-white/[.08]">Window</th>
                  <th className="border border-black/[.06] px-2 py-1 text-left dark:border-white/[.08]">Dock</th>
                  <th className="border border-black/[.06] px-2 py-1 text-left dark:border-white/[.08]">Carrier</th>
                  <th className="border border-black/[.06] px-2 py-1 text-left dark:border-white/[.08]">Reference</th>
                  <th className="border border-black/[.06] px-2 py-1 text-left dark:border-white/[.08]">Detail</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.type}-${r.referenceNumber}-${i}`}>
                    <td className="border border-black/[.06] px-2 py-1 dark:border-white/[.08]">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_STYLES[r.type]}`}>
                        {TYPE_LABELS[r.type]}
                      </span>
                    </td>
                    <td className="border border-black/[.06] px-2 py-1 font-mono dark:border-white/[.08]">
                      {toISODate(r.scheduledStart)}
                    </td>
                    <td className="border border-black/[.06] px-2 py-1 font-mono dark:border-white/[.08]">
                      {formatTime(r.scheduledStart)}–{formatTime(r.scheduledEnd)}
                    </td>
                    <td className="border border-black/[.06] px-2 py-1 dark:border-white/[.08]">{r.dockName}</td>
                    <td className="border border-black/[.06] px-2 py-1 dark:border-white/[.08]">{r.carrierName}</td>
                    <td className="border border-black/[.06] px-2 py-1 dark:border-white/[.08]">{r.referenceNumber}</td>
                    <td className="border border-black/[.06] px-2 py-1 dark:border-white/[.08]">{r.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
