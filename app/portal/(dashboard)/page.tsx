import Link from "next/link";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getPortalUser } from "@/lib/portal-session";
import { notifyBookingCancelled, detectNoShowMany, cancelBooking as cancelBookingRecord } from "@/lib/bookings";
import { computeCarrierScore, computeCarrierScoreTrend, type CarrierScore } from "@/lib/carrier-score";
import { STATUS_STYLES, LOAD_TYPE_STYLES, formatTime } from "@/lib/booking-display";

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
  INSUFFICIENT_DATA: "Not enough history yet",
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

async function submitAppeal(formData: FormData) {
  "use server";

  const user = await getPortalUser();
  if (!user) return;

  const note = String(formData.get("note") ?? "").trim();
  if (!note) return;

  await prisma.scoreAppeal.create({
    data: { carrierId: user.carrier.id, note, createdByCarrierUserId: user.id },
  });

  revalidatePath("/portal");
}

async function cancelBooking(formData: FormData) {
  "use server";

  const user = await getPortalUser();
  if (!user) return;

  const bookingId = String(formData.get("bookingId") ?? "");
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.carrierId !== user.carrier.id) return;

  const deleted = await cancelBookingRecord(bookingId, { carrierUserId: user.id });

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
  const user = await getPortalUser();
  if (!user) return null;
  const carrier = user.carrier;

  const [rawBookings, score, scoreTrend] = await Promise.all([
    prisma.booking.findMany({
      where: { carrierId: carrier.id },
      include: {
        dock: true,
        createdByStaff: { select: { name: true } },
        createdByCarrierUser: { select: { name: true } },
      },
      orderBy: { startTime: "desc" },
    }),
    computeCarrierScore(carrier.id),
    computeCarrierScoreTrend(carrier.id),
  ]);
  const bookings = await detectNoShowMany(rawBookings);

  const now = new Date();
  const upcoming = bookings.filter((b) => b.endTime >= now).sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  const past = bookings.filter((b) => b.endTime < now);

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-2xl border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-[#0a0a0a]">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-medium text-black dark:text-zinc-50">Your Trust Score</h2>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TIER_STYLES[score.tier]}`}>
            {TIER_LABELS[score.tier]}
          </span>
          {score.overall !== null && (
            <span className="font-mono text-sm text-zinc-500 dark:text-zinc-400">{Math.round(score.overall)}/100</span>
          )}
        </div>
        <ul className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
          <li>On-time arrivals: {score.onTime.value !== null ? `${Math.round(score.onTime.value)}%` : "—"} ({score.onTime.detail})</li>
          <li>No-shows: {score.noShow.value !== null ? `${Math.round(100 - score.noShow.value)}%` : "—"} ({score.noShow.detail})</li>
          <li>Dwell efficiency: {score.dwell.value !== null ? `${Math.round(score.dwell.value)}%` : "—"} ({score.dwell.detail})</li>
          <li>Cancellations: {score.cancellation.value !== null ? `${Math.round(100 - score.cancellation.value)}%` : "—"} ({score.cancellation.detail})</li>
        </ul>
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Score history (last {scoreTrend.length} weeks)
          </summary>
          <div className="mt-2 flex h-10 items-end gap-1">
            {scoreTrend.map((bucket) => (
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
            <ComponentTrendRow label="On-time" points={scoreTrend.map((b) => ({ ...b, value: b.onTime.value }))} />
            <ComponentTrendRow
              label="No-shows"
              points={scoreTrend.map((b) => ({ ...b, value: b.noShow.value !== null ? 100 - b.noShow.value : null }))}
            />
            <ComponentTrendRow label="Dwell efficiency" points={scoreTrend.map((b) => ({ ...b, value: b.dwell.value }))} />
            <ComponentTrendRow
              label="Cancellations"
              points={scoreTrend.map((b) => ({ ...b, value: b.cancellation.value !== null ? 100 - b.cancellation.value : null }))}
            />
          </div>
        </details>
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Dispute this score
          </summary>
          <form action={submitAppeal} className="mt-2 flex flex-col gap-2">
            <textarea
              name="note"
              required
              rows={2}
              placeholder="Tell us what looks wrong and we'll take a look."
              className="w-full rounded-lg border border-black/[.08] bg-white px-3 py-2 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            />
            <button
              type="submit"
              className="h-8 w-fit rounded-full border border-black/[.08] px-3 text-xs font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
            >
              Submit
            </button>
          </form>
        </details>
      </section>

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
                  {(booking.createdByStaff || booking.createdByCarrierUser) && (
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      booked by {(booking.createdByCarrierUser ?? booking.createdByStaff)!.name}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${LOAD_TYPE_STYLES[booking.loadType]}`}>
                    {booking.loadType}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[booking.status]}`}>
                    {booking.status.replace("_", " ")}
                  </span>
                  {booking.status === "SCHEDULED" && (
                    <>
                      <Link
                        href={`/portal/bookings/${booking.id}/reschedule`}
                        className="flex h-8 items-center rounded-full border border-black/[.08] px-3 text-xs font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
                      >
                        Reschedule
                      </Link>
                      <form action={cancelBooking}>
                        <input type="hidden" name="bookingId" value={booking.id} />
                        <button
                          type="submit"
                          className="h-8 rounded-full border border-black/[.08] px-3 text-xs font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
                        >
                          Cancel
                        </button>
                      </form>
                    </>
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
