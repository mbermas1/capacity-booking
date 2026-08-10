import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getPublicDockAvailability } from "@/lib/availability";
import { submitPublicBookingRequest } from "@/lib/booking-requests";
import { LoadType } from "@/app/generated/prisma/client";

function parseUtc(datetimeLocalValue: string): Date | null {
  if (!datetimeLocalValue) return null;
  const date = new Date(`${datetimeLocalValue}:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function submitRequest(slug: string, warehouseId: string, formData: FormData) {
  "use server";

  const dockId = String(formData.get("dockId") ?? "");
  const startTimeRaw = String(formData.get("startTime") ?? "");
  const endTimeRaw = String(formData.get("endTime") ?? "");
  const companyName = String(formData.get("companyName") ?? "").trim();
  const contactEmail = String(formData.get("contactEmail") ?? "").trim();
  const contactPhone = String(formData.get("contactPhone") ?? "").trim();
  const referenceNumber = String(formData.get("referenceNumber") ?? "").trim();
  const loadType = String(formData.get("loadType") ?? "");

  const params = new URLSearchParams({ dockId, startTime: startTimeRaw, endTime: endTimeRaw });

  const startTime = parseUtc(startTimeRaw);
  const endTime = parseUtc(endTimeRaw);

  if (
    !dockId ||
    !startTime ||
    !endTime ||
    !companyName ||
    !contactEmail ||
    !referenceNumber ||
    (loadType !== LoadType.INBOUND && loadType !== LoadType.OUTBOUND)
  ) {
    params.set("error", "invalid");
    redirect(`/book/${slug}?${params.toString()}`);
  }

  const result = await submitPublicBookingRequest({
    warehouseId,
    dockId,
    startTime,
    endTime,
    companyName,
    contactEmail,
    contactPhone: contactPhone || undefined,
    referenceNumber,
    loadType: loadType as LoadType,
  });

  if (result.outcome === "dock_not_found" || result.outcome === "unavailable") {
    params.set("error", result.outcome === "dock_not_found" ? "invalid" : "unavailable");
    redirect(`/book/${slug}?${params.toString()}`);
  }

  redirect(`/book/${slug}?submitted=${result.outcome}`);
}

export default async function PublicBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ dockId?: string; startTime?: string; endTime?: string; error?: string; submitted?: string }>;
}) {
  const { slug } = await params;
  const { dockId, startTime: startTimeParam, endTime: endTimeParam, error, submitted } = await searchParams;

  const warehouse = await prisma.warehouse.findUnique({
    where: { publicBookingSlug: slug },
    select: {
      id: true,
      name: true,
      location: true,
      docks: { select: { id: true, name: true, location: true, equipmentType: true }, orderBy: { name: "asc" } },
    },
  });

  if (!warehouse) notFound();

  const startTime = startTimeParam ? parseUtc(startTimeParam) : null;
  const endTime = endTimeParam ? parseUtc(endTimeParam) : null;

  const availability =
    dockId && startTime && endTime ? await getPublicDockAvailability(dockId, startTime, endTime) : null;

  const boundSubmitRequest = submitRequest.bind(null, slug, warehouse.id);

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 font-sans dark:bg-black">
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10 sm:px-10">
        <section className="mb-8">
          <h1 className="text-xl font-semibold text-black dark:text-zinc-50">{warehouse.name}</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {warehouse.location} · Request a dock appointment
          </p>
        </section>

        {submitted === "approved" && (
          <p className="mb-6 rounded-lg bg-green-100 px-3 py-2 text-sm text-green-800 dark:bg-green-950 dark:text-green-300">
            Booking confirmed! Your appointment has been automatically approved.
          </p>
        )}
        {submitted === "pending" && (
          <p className="mb-6 rounded-lg bg-green-100 px-3 py-2 text-sm text-green-800 dark:bg-green-950 dark:text-green-300">
            Request submitted — a member of our team will confirm your appointment.
          </p>
        )}

        <section>
          <form
            action={`/book/${slug}`}
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
                {warehouse.docks.map((dock) => (
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
          <p className="mt-6 rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-300">
            All fields are required and the end time must be after the start time.
          </p>
        )}
        {error === "unavailable" && (
          <p className="mt-6 rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-300">
            That slot is no longer available. Check availability again and pick a different time.
          </p>
        )}

        {availability === null && dockId && (
          <p className="mt-6 text-sm text-zinc-500 dark:text-zinc-500">Dock not found.</p>
        )}

        {availability && (
          <section className="mt-6 rounded-2xl border border-black/[.08] bg-white p-5 dark:border-white/[.145] dark:bg-[#0a0a0a]">
            {availability.available ? (
              <>
                <p className="mb-4 text-sm font-medium text-green-700 dark:text-green-400">
                  Available ({availability.remainingCapacity} open)
                </p>
                <form action={boundSubmitRequest} className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
                  <input type="hidden" name="dockId" value={dockId} />
                  <input type="hidden" name="startTime" value={startTimeParam} />
                  <input type="hidden" name="endTime" value={endTimeParam} />
                  <div className="flex flex-col gap-1">
                    <label htmlFor="companyName" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      Company Name
                    </label>
                    <input
                      id="companyName"
                      name="companyName"
                      type="text"
                      required
                      className="h-10 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="contactEmail" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      Contact Email
                    </label>
                    <input
                      id="contactEmail"
                      name="contactEmail"
                      type="email"
                      required
                      className="h-10 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="contactPhone" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      Contact Phone (optional)
                    </label>
                    <input
                      id="contactPhone"
                      name="contactPhone"
                      type="tel"
                      className="h-10 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
                    />
                  </div>
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
                  <button
                    type="submit"
                    className="h-10 rounded-full bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
                  >
                    Submit Request
                  </button>
                </form>
              </>
            ) : (
              <p className="text-sm font-medium text-red-700 dark:text-red-400">
                Not available for this window. Try a different time.
              </p>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
