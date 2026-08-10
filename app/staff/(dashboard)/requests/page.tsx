import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getStaffMember } from "@/lib/staff-session";
import { canAccessWarehouse, canApproveRequests, getWarehouseScope, warehouseWhereClause } from "@/lib/staff-roles";
import { formatTime } from "@/lib/booking-display";
import {
  BookingOverlapError,
  DockNotFoundError,
  DockClosedError,
  MissingCarrierTagError,
  UnacceptedCommodityError,
  MinimumDurationError,
  createBooking,
} from "@/lib/bookings";

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  APPROVED: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  REJECTED: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(
    date,
  );
}

async function approveRequest(requestId: string) {
  "use server";

  const staff = await getStaffMember();
  if (!staff || !canApproveRequests(staff.role)) return;

  const bookingRequest = await prisma.bookingRequest.findUnique({ where: { id: requestId } });
  if (
    !bookingRequest ||
    !canAccessWarehouse(staff, bookingRequest.warehouseId) ||
    bookingRequest.status !== "PENDING"
  ) {
    return;
  }

  const params = new URLSearchParams();

  try {
    const carrier = await prisma.carrier.upsert({
      where: { name: bookingRequest.companyName },
      create: { name: bookingRequest.companyName, email: bookingRequest.contactEmail },
      update: {},
    });

    await createBooking({
      dockId: bookingRequest.dockId,
      startTime: bookingRequest.startTime,
      endTime: bookingRequest.endTime,
      carrierId: carrier.id,
      referenceNumber: bookingRequest.referenceNumber,
      loadType: bookingRequest.loadType,
    });

    await prisma.bookingRequest.update({
      where: { id: requestId },
      data: { status: "APPROVED", verifiedAt: bookingRequest.verifiedAt ?? new Date() },
    });
    params.set("message", "Request approved and booked.");
  } catch (error) {
    let reason = "Internal server error";
    if (
      error instanceof DockNotFoundError ||
      error instanceof BookingOverlapError ||
      error instanceof DockClosedError ||
      error instanceof MissingCarrierTagError ||
      error instanceof UnacceptedCommodityError ||
      error instanceof MinimumDurationError
    ) {
      reason = error.message;
    } else {
      console.error("Failed to approve booking request:", error);
    }
    params.set("error", reason);
  }

  redirect(`/staff/requests?${params.toString()}`);
}

async function rejectRequest(requestId: string, formData: FormData) {
  "use server";

  const staff = await getStaffMember();
  if (!staff || !canApproveRequests(staff.role)) return;

  const bookingRequest = await prisma.bookingRequest.findUnique({ where: { id: requestId } });
  if (
    !bookingRequest ||
    !canAccessWarehouse(staff, bookingRequest.warehouseId) ||
    bookingRequest.status !== "PENDING"
  ) {
    return;
  }

  const reviewNote = String(formData.get("reviewNote") ?? "").trim();

  await prisma.bookingRequest.update({
    where: { id: requestId },
    data: { status: "REJECTED", reviewNote: reviewNote || undefined },
  });

  redirect("/staff/requests?message=Request rejected.");
}

async function regenerateLink(warehouseId: string) {
  "use server";

  const staff = await getStaffMember();
  if (!staff || !canApproveRequests(staff.role) || !canAccessWarehouse(staff, warehouseId)) return;

  const publicBookingSlug = randomBytes(16).toString("hex");
  await prisma.warehouse.update({ where: { id: warehouseId }, data: { publicBookingSlug } });

  redirect("/staff/requests?message=Link regenerated. The old link no longer works.");
}

export default async function StaffRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; error?: string }>;
}) {
  const staff = await getStaffMember();
  if (!staff) return null;
  if (!canApproveRequests(staff.role)) {
    return <p className="text-sm text-zinc-600 dark:text-zinc-400">You don&apos;t have access to this page.</p>;
  }

  const { message, error } = await searchParams;

  const scope = getWarehouseScope(staff);
  const accessibleWarehouses = await prisma.warehouse.findMany({
    where: scope === null ? {} : { id: { in: scope } },
    orderBy: { name: "asc" },
  });

  const requests = await prisma.bookingRequest.findMany({
    where: { warehouseId: warehouseWhereClause(staff) },
    include: { dock: { include: { warehouse: { select: { name: true } } } } },
    orderBy: { createdAt: "desc" },
  });

  const pending = requests.filter((r) => r.status === "PENDING");
  const decided = requests.filter((r) => r.status !== "PENDING");

  return (
    <div className="flex flex-col gap-8">
      {message && (
        <p className="rounded-lg bg-green-100 px-3 py-2 text-sm text-green-800 dark:bg-green-950 dark:text-green-300">
          {message}
        </p>
      )}
      {error && (
        <p className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-300">
          Could not approve: {error}
        </p>
      )}

      <section>
        <h2 className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">Public Booking Link</h2>
        <div className="flex flex-col gap-3">
          {accessibleWarehouses.map((w) => {
            const boundRegenerate = regenerateLink.bind(null, w.id);
            return (
              <div
                key={w.id}
                className="flex flex-wrap items-center gap-3 rounded-2xl border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-[#0a0a0a]"
              >
                {accessibleWarehouses.length > 1 && (
                  <span className="text-sm font-medium text-black dark:text-zinc-50">{w.name}</span>
                )}
                <code className="rounded-lg bg-zinc-100 px-3 py-2 text-sm text-black dark:bg-zinc-900 dark:text-zinc-50">
                  /book/{w.publicBookingSlug}
                </code>
                <form action={boundRegenerate}>
                  <button
                    type="submit"
                    className="h-9 rounded-full border border-black/[.08] px-4 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
                  >
                    Regenerate Link
                  </button>
                </form>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">
          Anyone with this link can view open capacity and submit a request — no login required. Regenerating
          immediately invalidates the current link.
        </p>
      </section>

      <section>
        <h1 className="mb-4 text-xl font-semibold text-black dark:text-zinc-50">Pending Requests</h1>
        {pending.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-500">No pending requests.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {pending.map((r) => {
              const boundApprove = approveRequest.bind(null, r.id);
              const boundReject = rejectRequest.bind(null, r.id);
              return (
                <li
                  key={r.id}
                  className="flex flex-col gap-3 rounded-2xl border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-[#0a0a0a]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-medium text-black dark:text-zinc-50">
                        {r.companyName} · {accessibleWarehouses.length > 1 && `${r.dock.warehouse.name} · `}
                        {r.dock.name}
                      </span>
                      <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                        {formatDate(r.startTime)} · {formatTime(r.startTime)}–{formatTime(r.endTime)}
                      </span>
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        {r.contactEmail}
                        {r.contactPhone ? ` · ${r.contactPhone}` : ""} · {r.referenceNumber} · {r.loadType}
                      </span>
                      {r.reviewNote && (
                        <span className="text-xs text-amber-700 dark:text-amber-400">{r.reviewNote}</span>
                      )}
                      {!r.verifiedAt && !r.reviewNote && (
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">Awaiting email verification</span>
                      )}
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[r.status]}`}>
                      {r.status}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <form action={boundApprove}>
                      <button
                        type="submit"
                        className="h-8 rounded-full bg-foreground px-3 text-xs font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
                      >
                        Approve
                      </button>
                    </form>
                    <form action={boundReject} className="flex items-center gap-2">
                      <input
                        type="text"
                        name="reviewNote"
                        placeholder="Reason (optional)"
                        className="h-8 rounded-lg border border-black/[.08] bg-white px-2 text-xs text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
                      />
                      <button
                        type="submit"
                        className="h-8 rounded-full border border-black/[.08] px-3 text-xs font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
                      >
                        Reject
                      </button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium text-black dark:text-zinc-50">Recently Decided</h2>
        {decided.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-500">No decided requests yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-black/[.06] rounded-2xl border border-black/[.08] bg-white px-4 dark:divide-white/[.08] dark:border-white/[.145] dark:bg-[#0a0a0a]">
            {decided.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm text-black dark:text-zinc-50">
                    {r.companyName} · {r.dock.name}
                  </span>
                  <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                    {formatDate(r.startTime)} · {formatTime(r.startTime)}–{formatTime(r.endTime)}
                  </span>
                  {r.reviewNote && (
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">{r.reviewNote}</span>
                  )}
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[r.status]}`}>
                  {r.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
