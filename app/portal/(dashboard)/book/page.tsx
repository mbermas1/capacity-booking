import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getDockAvailability } from "@/lib/availability";
import { getPortalSession } from "@/lib/portal-session";
import {
  BookingOverlapError,
  DockClosedError,
  MissingCarrierTagError,
  UnacceptedCommodityError,
  MinimumDurationError,
  createBooking,
} from "@/lib/bookings";
import { formatTime } from "@/lib/booking-display";
import { LoadType, BookingPriority } from "@/app/generated/prisma/client";

function parseUtc(datetimeLocalValue: string): Date | null {
  if (!datetimeLocalValue) return null;
  const date = new Date(`${datetimeLocalValue}:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function bookSlot(formData: FormData) {
  "use server";

  const session = await getPortalSession();
  if (!session) redirect("/portal/login");

  const dockId = String(formData.get("dockId") ?? "");
  const startTimeRaw = String(formData.get("startTime") ?? "");
  const endTimeRaw = String(formData.get("endTime") ?? "");
  const referenceNumber = String(formData.get("referenceNumber") ?? "").trim();
  const loadType = String(formData.get("loadType") ?? "");
  const priorityRaw = String(formData.get("priority") ?? "");
  const commodityTagId = String(formData.get("commodityTagId") ?? "");
  const shipmentVolumeRaw = String(formData.get("shipmentVolume") ?? "").trim();

  const params = new URLSearchParams({ dockId, startTime: startTimeRaw, endTime: endTimeRaw });

  const startTime = parseUtc(startTimeRaw);
  const endTime = parseUtc(endTimeRaw);

  if (!dockId || !startTime || !endTime || !referenceNumber || (loadType !== LoadType.INBOUND && loadType !== LoadType.OUTBOUND)) {
    params.set("error", "invalid");
    redirect(`/portal/book?${params.toString()}`);
  }

  const priority = Object.values(BookingPriority).includes(priorityRaw as BookingPriority)
    ? (priorityRaw as BookingPriority)
    : undefined;

  const shipmentVolume =
    shipmentVolumeRaw && Number.isInteger(Number(shipmentVolumeRaw)) && Number(shipmentVolumeRaw) >= 0
      ? Number(shipmentVolumeRaw)
      : undefined;

  try {
    await createBooking({
      dockId,
      startTime,
      endTime,
      carrierId: session.carrierId,
      referenceNumber,
      loadType: loadType as LoadType,
      priority,
      shipmentVolume,
      commodityTagIds: commodityTagId ? [commodityTagId] : undefined,
    });
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
    } else {
      throw error;
    }
    redirect(`/portal/book?${params.toString()}`);
  }

  redirect("/portal");
}

export default async function PortalBookPage({
  searchParams,
}: {
  searchParams: Promise<{ dockId?: string; startTime?: string; endTime?: string; error?: string }>;
}) {
  const { dockId, startTime: startTimeParam, endTime: endTimeParam, error } = await searchParams;

  const [docks, commodityTags] = await Promise.all([
    prisma.dock.findMany({ orderBy: { name: "asc" } }),
    prisma.tag.findMany({ where: { category: "COMMODITY" }, orderBy: { name: "asc" } }),
  ]);

  const startTime = startTimeParam ? parseUtc(startTimeParam) : null;
  const endTime = endTimeParam ? parseUtc(endTimeParam) : null;

  const availability =
    dockId && startTime && endTime ? await getDockAvailability(dockId, startTime, endTime) : null;

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="mb-4 text-xl font-semibold text-black dark:text-zinc-50">Book a Slot</h1>

        <form
          action="/portal/book"
          className="flex flex-col gap-4 rounded-2xl border border-black/[.08] bg-white p-5 dark:border-white/[.145] dark:bg-[#0a0a0a] sm:flex-row sm:flex-wrap sm:items-end"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="dockId" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Dock
            </label>
            <select
              id="dockId"
              name="dockId"
              defaultValue={dockId ?? ""}
              required
              className="h-10 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            >
              <option value="" disabled>
                Select a dock
              </option>
              {docks.map((dock) => (
                <option key={dock.id} value={dock.id}>
                  {dock.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="startTime" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Start (UTC)
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
              End (UTC)
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
            className="h-10 rounded-full border border-black/[.08] px-4 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
          >
            Check Availability
          </button>
        </form>
      </section>

      {error === "invalid" && (
        <p className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-300">
          All fields are required and the end time must be after the start time.
        </p>
      )}
      {error === "overlap" && (
        <p className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-300">
          That slot was just booked by someone else. Pick a different time.
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
          This dock doesn&rsquo;t accept the selected commodity. Pick a different dock or commodity.
        </p>
      )}
      {error === "duration" && (
        <p className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-300">
          The selected commodity requires a longer booking window. Extend the time range and try again.
        </p>
      )}

      {availability === null && dockId && (
        <p className="text-sm text-zinc-500 dark:text-zinc-500">Dock not found.</p>
      )}

      {availability && (
        <section className="rounded-2xl border border-black/[.08] bg-white p-5 dark:border-white/[.145] dark:bg-[#0a0a0a]">
          {availability.available ? (
            <>
              <p className="mb-4 text-sm font-medium text-green-700 dark:text-green-400">
                This slot is available.
              </p>
              <form action={bookSlot} className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
                <input type="hidden" name="dockId" value={dockId} />
                <input type="hidden" name="startTime" value={startTimeParam} />
                <input type="hidden" name="endTime" value={endTimeParam} />
                <div className="flex flex-col gap-1">
                  <label htmlFor="referenceNumber" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Reference Number
                  </label>
                  <input
                    id="referenceNumber"
                    name="referenceNumber"
                    type="text"
                    required
                    className="h-10 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="loadType" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Load Type
                  </label>
                  <select
                    id="loadType"
                    name="loadType"
                    required
                    className="h-10 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
                  >
                    <option value="INBOUND">Inbound</option>
                    <option value="OUTBOUND">Outbound</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="commodityTagId" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Commodity
                  </label>
                  <select
                    id="commodityTagId"
                    name="commodityTagId"
                    defaultValue=""
                    className="h-10 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
                  >
                    <option value="">No commodity</option>
                    {commodityTags.map((tag) => (
                      <option key={tag.id} value={tag.id}>
                        {tag.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="priority" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Priority
                  </label>
                  <select
                    id="priority"
                    name="priority"
                    defaultValue={BookingPriority.STANDARD}
                    className="h-10 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
                  >
                    <option value="LOW">Low</option>
                    <option value="STANDARD">Standard</option>
                    <option value="HIGH">High</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="shipmentVolume" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Pallet Count (optional)
                  </label>
                  <input
                    id="shipmentVolume"
                    name="shipmentVolume"
                    type="number"
                    min="0"
                    className="h-10 w-40 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
                  />
                </div>
                <button
                  type="submit"
                  className="h-10 rounded-full bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
                >
                  Book This Slot
                </button>
              </form>
            </>
          ) : (
            <>
              <p className="mb-3 text-sm font-medium text-red-700 dark:text-red-400">
                This slot conflicts with an existing booking:
              </p>
              <ul className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
                {availability.conflicts.map((conflict) => (
                  <li key={conflict.id} className="font-mono text-xs">
                    {formatTime(conflict.startTime)}–{formatTime(conflict.endTime)} ({conflict.carrierName})
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </div>
  );
}
