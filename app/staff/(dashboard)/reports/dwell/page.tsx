import Link from "next/link";
import { revalidatePath } from "next/cache";
import { getStaffMember } from "@/lib/staff-session";
import {
  accountWhereClause,
  canAccessWarehouse,
  canManageCapacityRules,
  canViewReports,
  getWarehouseScope,
  warehouseWhereClause,
} from "@/lib/staff-roles";
import { prisma } from "@/lib/prisma";
import { computeDwellReport } from "@/lib/reports";

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

async function updateDetentionRate(warehouseId: string, formData: FormData) {
  "use server";

  const staff = await getStaffMember();
  if (!staff || !canManageCapacityRules(staff.role) || !canAccessWarehouse(staff, warehouseId)) return;

  const rateRaw = String(formData.get("detentionRatePerHour") ?? "").trim();
  const freeRaw = String(formData.get("detentionFreeMinutes") ?? "").trim();

  const rate = rateRaw === "" ? null : Number(rateRaw);
  const free = freeRaw === "" ? null : Number(freeRaw);

  await prisma.warehouse.update({
    where: { id: warehouseId },
    data: {
      detentionRatePerHour: rate !== null && Number.isFinite(rate) && rate >= 0 ? rate : null,
      detentionFreeMinutes: free !== null && Number.isInteger(free) && free >= 0 ? free : null,
    },
  });

  revalidatePath("/staff/reports/dwell");
}

export default async function DwellReportPage({
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
  const canEditRate = canManageCapacityRules(staff.role);

  const { start: startParam, end: endParam, carrierName: carrierNameParam } = await searchParams;
  const carrierName = carrierNameParam?.trim() || undefined;
  const { start, end, endInclusive } = parseRange(startParam, endParam, DEFAULT_RANGE_DAYS);

  const [rows, carriers, rateWarehouses] = await Promise.all([
    computeDwellReport(start, end, { carrierName, warehouseId: warehouseWhereClause(staff) }),
    prisma.carrier.findMany({ where: { accountId: accountWhereClause(staff) }, orderBy: { name: "asc" }, select: { name: true } }),
    canEditRate
      ? prisma.warehouse.findMany({
          where: scope === null ? {} : { id: { in: scope } },
          orderBy: { name: "asc" },
          select: { id: true, name: true, detentionRatePerHour: true, detentionFreeMinutes: true },
        })
      : Promise.resolve([]),
  ]);

  const csvHref = `/api/staff/reports/dwell/export${buildQuery({
    start: toISODate(start),
    end: toISODate(endInclusive),
    carrierName,
  })}`;

  const totalDetentionMinutes = rows.reduce((sum, r) => sum + r.detentionMinutes, 0);
  const totalDetentionCost = rows.every((r) => r.detentionCost !== null)
    ? rows.reduce((sum, r) => sum + (r.detentionCost ?? 0), 0)
    : null;

  const byDock = new Map<string, { dockName: string; count: number; dwellMinutes: number; detentionMinutes: number; cost: number | null }>();
  for (const r of rows) {
    const existing = byDock.get(r.dockId) ?? {
      dockName: r.dockName,
      count: 0,
      dwellMinutes: 0,
      detentionMinutes: 0,
      cost: r.detentionCost !== null ? 0 : null,
    };
    existing.count += 1;
    existing.dwellMinutes += r.actualMinutes;
    existing.detentionMinutes += r.detentionMinutes;
    if (existing.cost !== null && r.detentionCost !== null) existing.cost += r.detentionCost;
    byDock.set(r.dockId, existing);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="no-print flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/staff/reports" className="text-sm text-zinc-500 hover:underline dark:text-zinc-400">
            ← Reports
          </Link>
          <h1 className="mt-1 text-xl font-semibold text-black dark:text-zinc-50">Dwell Time / Detention Report</h1>
        </div>
        <form action="/staff/reports/dwell" className="flex flex-wrap items-end gap-2">
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

      {canEditRate && (
      <div className="no-print flex flex-col gap-3">
        {rateWarehouses.map((w) => (
          <div
            key={w.id}
            className="rounded-2xl border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-[#0a0a0a]"
          >
            <h2 className="mb-2 text-sm font-medium text-black dark:text-zinc-50">
              Detention Rate{multiWarehouse ? ` — ${w.name}` : ""}
            </h2>
            <form action={updateDetentionRate.bind(null, w.id)} className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-1">
                <label htmlFor={`detentionRatePerHour-${w.id}`} className="text-xs text-zinc-600 dark:text-zinc-400">
                  Rate ($/hour, optional)
                </label>
                <input
                  id={`detentionRatePerHour-${w.id}`}
                  type="number"
                  name="detentionRatePerHour"
                  min="0"
                  step="0.01"
                  defaultValue={w.detentionRatePerHour ?? ""}
                  className="h-9 w-32 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor={`detentionFreeMinutes-${w.id}`} className="text-xs text-zinc-600 dark:text-zinc-400">
                  Free time (minutes, optional)
                </label>
                <input
                  id={`detentionFreeMinutes-${w.id}`}
                  type="number"
                  name="detentionFreeMinutes"
                  min="0"
                  defaultValue={w.detentionFreeMinutes ?? ""}
                  className="h-9 w-32 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
                />
              </div>
              <button
                type="submit"
                className="h-9 rounded-full border border-black/[.08] px-4 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
              >
                Save
              </button>
            </form>
          </div>
        ))}
        <p className="text-xs text-zinc-500 dark:text-zinc-500">
          Leave the rate blank to hide cost estimates. Free time is the grace period before detention starts accruing.
        </p>
      </div>
      )}

      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {multiWarehouse ? "All locations" : staff.warehouse?.name} · {toISODate(start)} – {toISODate(endInclusive)}{" "}
        (UTC)
        {carrierName ? ` · ${carrierName}` : ""}
      </p>

      {rows.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">No completed bookings with dwell data in this range.</p>
      ) : (
        <>
          <div className="rounded-2xl border border-black/[.08] bg-zinc-50 p-3 dark:border-white/[.145] dark:bg-zinc-900">
            <span className="text-sm font-semibold text-black dark:text-zinc-50">
              {rows.length} bookings · {totalDetentionMinutes} min total detention
              {totalDetentionCost !== null ? ` · $${totalDetentionCost.toFixed(2)} estimated` : ""}
            </span>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-black/[.08] dark:border-white/[.145]">
            <table className="min-w-full border-collapse text-xs">
              <thead>
                <tr className="bg-zinc-50 dark:bg-zinc-900">
                  <th className="border border-black/[.06] px-2 py-1 text-left dark:border-white/[.08]">Dock</th>
                  <th className="border border-black/[.06] px-2 py-1 text-right dark:border-white/[.08]">Bookings</th>
                  <th className="border border-black/[.06] px-2 py-1 text-right dark:border-white/[.08]">Avg Dwell (min)</th>
                  <th className="border border-black/[.06] px-2 py-1 text-right dark:border-white/[.08]">Detention (min)</th>
                  <th className="border border-black/[.06] px-2 py-1 text-right dark:border-white/[.08]">Est. Cost</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(byDock.values()).map((d) => (
                  <tr key={d.dockName}>
                    <td className="border border-black/[.06] px-2 py-1 dark:border-white/[.08]">{d.dockName}</td>
                    <td className="border border-black/[.06] px-2 py-1 text-right font-mono dark:border-white/[.08]">
                      {d.count}
                    </td>
                    <td className="border border-black/[.06] px-2 py-1 text-right font-mono dark:border-white/[.08]">
                      {Math.round(d.dwellMinutes / d.count)}
                    </td>
                    <td className="border border-black/[.06] px-2 py-1 text-right font-mono dark:border-white/[.08]">
                      {d.detentionMinutes}
                    </td>
                    <td className="border border-black/[.06] px-2 py-1 text-right font-mono dark:border-white/[.08]">
                      {d.cost !== null ? `$${d.cost.toFixed(2)}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-black/[.08] dark:border-white/[.145]">
            <table className="min-w-full border-collapse text-xs">
              <thead>
                <tr className="bg-zinc-50 dark:bg-zinc-900">
                  <th className="border border-black/[.06] px-2 py-1 text-left dark:border-white/[.08]">Date</th>
                  <th className="border border-black/[.06] px-2 py-1 text-left dark:border-white/[.08]">Dock</th>
                  <th className="border border-black/[.06] px-2 py-1 text-left dark:border-white/[.08]">Carrier</th>
                  <th className="border border-black/[.06] px-2 py-1 text-left dark:border-white/[.08]">Reference</th>
                  <th className="border border-black/[.06] px-2 py-1 text-right dark:border-white/[.08]">Scheduled (min)</th>
                  <th className="border border-black/[.06] px-2 py-1 text-right dark:border-white/[.08]">Actual (min)</th>
                  <th className="border border-black/[.06] px-2 py-1 text-right dark:border-white/[.08]">Detention (min)</th>
                  <th className="border border-black/[.06] px-2 py-1 text-right dark:border-white/[.08]">Est. Cost</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.bookingId}>
                    <td className="border border-black/[.06] px-2 py-1 dark:border-white/[.08]">{toISODate(r.startTime)}</td>
                    <td className="border border-black/[.06] px-2 py-1 dark:border-white/[.08]">{r.dockName}</td>
                    <td className="border border-black/[.06] px-2 py-1 dark:border-white/[.08]">{r.carrierName}</td>
                    <td className="border border-black/[.06] px-2 py-1 dark:border-white/[.08]">{r.referenceNumber}</td>
                    <td className="border border-black/[.06] px-2 py-1 text-right font-mono dark:border-white/[.08]">
                      {r.scheduledMinutes}
                    </td>
                    <td className="border border-black/[.06] px-2 py-1 text-right font-mono dark:border-white/[.08]">
                      {r.actualMinutes}
                    </td>
                    <td className="border border-black/[.06] px-2 py-1 text-right font-mono dark:border-white/[.08]">
                      {r.detentionMinutes}
                    </td>
                    <td className="border border-black/[.06] px-2 py-1 text-right font-mono dark:border-white/[.08]">
                      {r.detentionCost !== null ? `$${r.detentionCost.toFixed(2)}` : "—"}
                    </td>
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
