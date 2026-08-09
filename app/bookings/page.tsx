import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { STATUS_STYLES, LOAD_TYPE_STYLES, formatTime } from "@/lib/booking-display";

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

export default async function BookingsDayPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date: dateParam } = await searchParams;
  const dayStart = parseDateParam(dateParam);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const dateStr = toISODate(dayStart);

  const prevDate = toISODate(new Date(dayStart.getTime() - 24 * 60 * 60 * 1000));
  const nextDate = toISODate(new Date(dayStart.getTime() + 24 * 60 * 60 * 1000));

  const docks = await prisma.dock.findMany({
    orderBy: { name: "asc" },
    include: {
      bookings: {
        where: {
          startTime: { lt: dayEnd },
          endTime: { gt: dayStart },
        },
        include: { carrier: { select: { name: true } } },
        orderBy: { startTime: "asc" },
      },
    },
  });

  const totalBookings = docks.reduce((sum, dock) => sum + dock.bookings.length, 0);

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 font-sans dark:bg-black">
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10 sm:px-10">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
              Dock Schedule
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {totalBookings} booking{totalBookings === 1 ? "" : "s"} on {dateStr} (UTC)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/bookings?date=${prevDate}`}
              className="flex h-9 items-center justify-center rounded-full border border-black/[.08] px-4 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
            >
              ← Prev
            </Link>
            <form action="/bookings" className="flex items-center gap-2">
              <input
                type="date"
                name="date"
                defaultValue={dateStr}
                className="h-9 rounded-full border border-black/[.08] bg-white px-4 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
              />
              <button
                type="submit"
                className="h-9 rounded-full bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
              >
                Go
              </button>
            </form>
            <Link
              href={`/bookings?date=${nextDate}`}
              className="flex h-9 items-center justify-center rounded-full border border-black/[.08] px-4 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
            >
              Next →
            </Link>
          </div>
        </div>

        {docks.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">No docks configured yet.</p>
        ) : (
          <div className="flex flex-col gap-6">
            {docks.map((dock) => (
              <section
                key={dock.id}
                className="rounded-2xl border border-black/[.08] bg-white p-5 dark:border-white/[.145] dark:bg-[#0a0a0a]"
              >
                <div className="mb-3 flex items-baseline justify-between">
                  <h2 className="text-lg font-medium text-black dark:text-zinc-50">
                    {dock.name}
                  </h2>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {dock.location} · {dock.equipmentType}
                  </span>
                </div>

                {dock.bookings.length === 0 ? (
                  <p className="text-sm text-zinc-500 dark:text-zinc-500">No bookings</p>
                ) : (
                  <ul className="flex flex-col divide-y divide-black/[.06] dark:divide-white/[.08]">
                    {dock.bookings.map((booking) => (
                      <li
                        key={booking.id}
                        className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-28 shrink-0 font-mono text-sm text-black dark:text-zinc-50">
                            {formatTime(booking.startTime)}–{formatTime(booking.endTime)}
                          </span>
                          <span className="text-sm text-black dark:text-zinc-50">
                            {booking.carrier.name}
                          </span>
                          <span className="text-xs text-zinc-500 dark:text-zinc-400">
                            {booking.referenceNumber}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${LOAD_TYPE_STYLES[booking.loadType]}`}
                          >
                            {booking.loadType}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[booking.status]}`}
                          >
                            {booking.status.replace("_", " ")}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
