import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getPortalCarrier } from "@/lib/portal-session";
import {
  BookingNotFoundError,
  BookingOverlapError,
  DockClosedError,
  MissingCarrierTagError,
  UnacceptedCommodityError,
  MinimumDurationError,
  LeadTimeError,
  LaborCapacityError,
  YardCapacityError,
  rescheduleBooking,
  notifyBookingRescheduled,
} from "@/lib/bookings";
import { checkLeadTime } from "@/lib/booking-constraints";
import { formatTime } from "@/lib/booking-display";
import { BookingPriority } from "@/app/generated/prisma/client";

function parseUtc(datetimeLocalValue: string): Date | null {
  if (!datetimeLocalValue) return null;
  const date = new Date(`${datetimeLocalValue}:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function submitReschedule(bookingId: string, formData: FormData) {
  "use server";

  const carrier = await getPortalCarrier();
  if (!carrier) redirect("/portal/login");

  const existing = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { carrierId: true, priority: true, dockId: true },
  });
  if (!existing || existing.carrierId !== carrier.id) notFound();

  const startTimeRaw = String(formData.get("startTime") ?? "");
  const endTimeRaw = String(formData.get("endTime") ?? "");
  const params = new URLSearchParams({ startTime: startTimeRaw, endTime: endTimeRaw });

  const startTime = parseUtc(startTimeRaw);
  const endTime = parseUtc(endTimeRaw);

  if (!startTime || !endTime) {
    params.set("error", "invalid");
    redirect(`/portal/bookings/${bookingId}/reschedule?${params.toString()}`);
  }

  try {
    const dock = await prisma.dock.findUnique({ where: { id: existing.dockId }, select: { minLeadTimeMinutes: true } });
    if (
      existing.priority !== BookingPriority.HIGH &&
      dock &&
      checkLeadTime(dock.minLeadTimeMinutes, startTime, new Date())
    ) {
      throw new LeadTimeError(dock.minLeadTimeMinutes as number);
    }

    const { booking, previousStartTime, previousEndTime } = await rescheduleBooking(bookingId, {
      startTime,
      endTime,
    });

    await notifyBookingRescheduled(booking.id, previousStartTime, previousEndTime);
  } catch (error) {
    if (error instanceof BookingOverlapError) {
      params.set("error", "overlap");
    } else if (error instanceof DockClosedError) {
      params.set("error", "closed");
    } else if (error instanceof MissingCarrierTagError) {
      params.set("error", "missing-tag");
    } else if (error instanceof UnacceptedCommodityError) {
      params.set("error", "commodity");
    } else if (error instanceof MinimumDurationError) {
      params.set("error", "duration");
    } else if (error instanceof LeadTimeError) {
      params.set("error", "lead-time");
    } else if (error instanceof LaborCapacityError) {
      params.set("error", "labor");
    } else if (error instanceof YardCapacityError) {
      params.set("error", "yard");
    } else if (error instanceof BookingNotFoundError) {
      notFound();
    } else {
      throw error;
    }
    redirect(`/portal/bookings/${bookingId}/reschedule?${params.toString()}`);
  }

  redirect("/portal");
}

export default async function RescheduleBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ startTime?: string; endTime?: string; error?: string }>;
}) {
  const { id: bookingId } = await params;
  const { startTime: startTimeParam, endTime: endTimeParam, error } = await searchParams;

  const carrier = await getPortalCarrier();
  if (!carrier) redirect("/portal/login");

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { dock: { select: { name: true } } },
  });
  if (!booking || booking.carrierId !== carrier.id) notFound();

  const boundSubmitReschedule = submitReschedule.bind(null, bookingId);

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="mb-1 text-xl font-semibold text-black dark:text-zinc-50">Reschedule Booking</h1>
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          {booking.dock.name} · Currently {formatTime(booking.startTime)}–{formatTime(booking.endTime)} ·{" "}
          {booking.referenceNumber}
        </p>

        <form
          action={boundSubmitReschedule}
          className="flex flex-col gap-4 rounded-2xl border border-black/[.08] bg-white p-5 dark:border-white/[.145] dark:bg-[#0a0a0a] sm:flex-row sm:flex-wrap sm:items-end"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="startTime" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              New Start (UTC)
            </label>
            <input
              id="startTime"
              name="startTime"
              type="datetime-local"
              defaultValue={startTimeParam ?? ""}
              required
              className="h-10 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="endTime" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              New End (UTC)
            </label>
            <input
              id="endTime"
              name="endTime"
              type="datetime-local"
              defaultValue={endTimeParam ?? ""}
              required
              className="h-10 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            />
          </div>
          <button
            type="submit"
            className="h-10 rounded-full bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            Reschedule
          </button>
        </form>
      </section>

      {error === "invalid" && (
        <p className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-300">
          Both a start and end time are required, and the end time must be after the start time.
        </p>
      )}
      {error === "overlap" && (
        <p className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-300">
          That slot is not available. Pick a different time.
        </p>
      )}
      {error === "closed" && (
        <p className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-300">
          This dock is closed during the requested time. Check its operating hours and try a different time.
        </p>
      )}
      {error === "missing-tag" && (
        <p className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-300">
          This dock requires a carrier certification your account doesn&rsquo;t have yet. Contact the warehouse.
        </p>
      )}
      {error === "commodity" && (
        <p className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-300">
          This dock doesn&rsquo;t accept the booking&rsquo;s declared commodity at the new time. Pick a different
          time.
        </p>
      )}
      {error === "duration" && (
        <p className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-300">
          The booking&rsquo;s declared commodity requires a longer window. Extend the time range and try again.
        </p>
      )}
      {error === "lead-time" && (
        <p className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-300">
          This reschedule must be made further in advance. Check the dock&rsquo;s lead time requirement and try
          again.
        </p>
      )}
      {error === "labor" && (
        <p className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-300">
          No scheduled labor is available for this window. Pick a different time.
        </p>
      )}
      {error === "yard" && (
        <p className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-300">
          The yard is at capacity for this window. Pick a different time.
        </p>
      )}
    </div>
  );
}
