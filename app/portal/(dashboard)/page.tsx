import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getPortalSession } from "@/lib/portal-session";
import { notifyBookingCancelled } from "@/lib/bookings";
import { STATUS_STYLES, LOAD_TYPE_STYLES, formatTime } from "@/lib/booking-display";

async function cancelBooking(formData: FormData) {
  "use server";

  const session = await getPortalSession();
  if (!session) return;

  const bookingId = String(formData.get("bookingId") ?? "");
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.carrierId !== session.carrierId) return;

  const deleted = await prisma.booking.delete({
    where: { id: bookingId },
    include: { dock: { select: { name: true } }, carrier: { select: { email: true } } },
  });

  await notifyBookingCancelled(deleted);

  revalidatePath("/portal");
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export default async function PortalDashboardPage() {
  const session = await getPortalSession();
  if (!session) return null;

  const bookings = await prisma.booking.findMany({
    where: { carrierId: session.carrierId },
    include: { dock: true },
    orderBy: { startTime: "desc" },
  });

  const now = new Date();
  const upcoming = bookings.filter((b) => b.endTime >= now).sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  const past = bookings.filter((b) => b.endTime < now);

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="mb-3 text-lg font-medium text-black dark:text-zinc-50">Upcoming Bookings</h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-500">No upcoming bookings.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {upcoming.map((booking) => (
              <li
                key={booking.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-[#0a0a0a]"
              >
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-black dark:text-zinc-50">
                    {booking.dock.name}
                  </span>
                  <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                    {formatDate(booking.startTime)} · {formatTime(booking.startTime)}–{formatTime(booking.endTime)}
                  </span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">{booking.referenceNumber}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${LOAD_TYPE_STYLES[booking.loadType]}`}>
                    {booking.loadType}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[booking.status]}`}>
                    {booking.status.replace("_", " ")}
                  </span>
                  {booking.status === "SCHEDULED" && (
                    <form action={cancelBooking}>
                      <input type="hidden" name="bookingId" value={booking.id} />
                      <button
                        type="submit"
                        className="h-8 rounded-full border border-black/[.08] px-3 text-xs font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
                      >
                        Cancel
                      </button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium text-black dark:text-zinc-50">Past Bookings</h2>
        {past.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-500">No past bookings.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-black/[.06] rounded-2xl border border-black/[.08] bg-white px-4 dark:divide-white/[.08] dark:border-white/[.145] dark:bg-[#0a0a0a]">
            {past.map((booking) => (
              <li key={booking.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="flex flex-col gap-1">
                  <span className="text-sm text-black dark:text-zinc-50">{booking.dock.name}</span>
                  <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                    {formatDate(booking.startTime)} · {formatTime(booking.startTime)}–{formatTime(booking.endTime)}
                  </span>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[booking.status]}`}>
                  {booking.status.replace("_", " ")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
