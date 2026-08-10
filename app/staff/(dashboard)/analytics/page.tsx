import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getStaffMember } from "@/lib/staff-session";
import { computeUtilization } from "@/lib/utilization";

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

function formatDuration(ms: number): string {
  const totalMinutes = Math.round(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

export default async function StaffAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; carrierName?: string }>;
}) {
  const staff = await getStaffMember();
  if (!staff) return null;

  const { date: dateParam, carrierName: carrierNameParam } = await searchParams;
  const carrierName = carrierNameParam?.trim() || undefined;

  const dayStart = parseDateParam(dateParam);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const dateStr = toISODate(dayStart);

  const prevDate = toISODate(new Date(dayStart.getTime() - 24 * 60 * 60 * 1000));
  const nextDate = toISODate(new Date(dayStart.getTime() + 24 * 60 * 60 * 1000));

  const [stats, carriers] = await Promise.all([
    computeUtilization(dayStart, dayEnd, { carrierName, warehouseId: staff.warehouseId }),
    prisma.carrier.findMany({ orderBy: { name: "asc" }, select: { name: true } }),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <section>
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-black dark:text-zinc-50">Dock Utilization</h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {staff.warehouse?.name} on {dateStr} (UTC){carrierName ? ` · ${carrierName}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/staff/analytics?date=${prevDate}${carrierName ? `&carrierName=${encodeURIComponent(carrierName)}` : ""}`}
              className="flex h-9 items-center justify-center rounded-full border border-black/[.08] px-4 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
            >
              ← Prev
            </Link>
            <form action="/staff/analytics" className="flex items-center gap-2">
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
              href={`/staff/analytics?date=${nextDate}${carrierName ? `&carrierName=${encodeURIComponent(carrierName)}` : ""}`}
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
        )}
      </section>
    </div>
  );
}
