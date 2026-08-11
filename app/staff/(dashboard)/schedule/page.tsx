import Link from "next/link";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getStaffMember } from "@/lib/staff-session";
import { canAccessWarehouse, canOperateSchedule, getWarehouseScope, warehouseWhereClause } from "@/lib/staff-roles";
import { detectNoShowMany, checkInBooking, completeBooking } from "@/lib/bookings";
import { STATUS_STYLES, LOAD_TYPE_STYLES, PRIORITY_STYLES, formatTime } from "@/lib/booking-display";

async function assertBookingAccess(staff: NonNullable<Awaited<ReturnType<typeof getStaffMember>>>, bookingId: string): Promise<boolean> {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, select: { dock: { select: { warehouseId: true } } } });
  return booking !== null && canAccessWarehouse(staff, booking.dock.warehouseId);
}

async function checkIn(formData: FormData) {
  "use server";

  const staff = await getStaffMember();
  if (!staff || !canOperateSchedule(staff.role)) return;

  const bookingId = String(formData.get("bookingId") ?? "");
  if (!(await assertBookingAccess(staff, bookingId))) return;
  try {
    await checkInBooking(bookingId, { staffId: staff.id });
  } catch {
    // booking already moved on (e.g. concurrent edit) — ignore, the re-render shows current state
  }

  revalidatePath("/staff/schedule");
}

async function complete(formData: FormData) {
  "use server";

  const staff = await getStaffMember();
  if (!staff || !canOperateSchedule(staff.role)) return;

  const bookingId = String(formData.get("bookingId") ?? "");
  if (!(await assertBookingAccess(staff, bookingId))) return;
  try {
    await completeBooking(bookingId, { staffId: staff.id });
  } catch {
    // booking already moved on — ignore, the re-render shows current state
  }

  revalidatePath("/staff/schedule");
}

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

export default async function StaffSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const staff = await getStaffMember();
  if (!staff) return null;
  if (!canOperateSchedule(staff.role)) {
    return <p className="text-sm text-zinc-600 dark:text-zinc-400">You don&apos;t have access to this page.</p>;
  }

  const { date: dateParam } = await searchParams;
  const dayStart = parseDateParam(dateParam);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const dateStr = toISODate(dayStart);

  const prevDate = toISODate(new Date(dayStart.getTime() - 24 * 60 * 60 * 1000));
  const nextDate = toISODate(new Date(dayStart.getTime() + 24 * 60 * 60 * 1000));

  const scope = getWarehouseScope(staff);
  const multiWarehouse = scope === null || scope.length > 1;

  const rawDocks = await prisma.dock.findMany({
    where: { warehouseId: warehouseWhereClause(staff) },
    orderBy: { name: "asc" },
    include: {
      warehouse: { select: { name: true } },
      bookings: {
        where: {
          startTime: { lt: dayEnd },
          endTime: { gt: dayStart },
        },
        include: {
          carrier: { select: { name: true } },
          tags: { include: { tag: true } },
          createdByStaff: { select: { name: true } },
          createdByCarrierUser: { select: { name: true } },
          checkedInByStaff: { select: { name: true } },
          completedByStaff: { select: { name: true } },
        },
        orderBy: { startTime: "asc" },
      },
    },
  });

  const docks = await Promise.all(
    rawDocks.map(async (dock) => ({ ...dock, bookings: await detectNoShowMany(dock.bookings) })),
  );

  const totalBookings = docks.reduce((sum, dock) => sum + dock.bookings.length, 0);

  return (
    <div className="flex flex-col gap-8">
      <section>
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-black dark:text-zinc-50">Dock Schedule</h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {totalBookings} booking{totalBookings === 1 ? "" : "s"}{" "}
              {multiWarehouse ? "across your locations" : `at ${staff.warehouse?.name}`} on {dateStr} (UTC)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/staff/schedule?date=${prevDate}`}
              className="flex h-9 items-center justify-center rounded-full border border-black/[.08] px-4 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
            >
              ← Prev
            </Link>
            <form action="/staff/schedule" className="flex items-center gap-2">
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
              href={`/staff/schedule?date=${nextDate}`}
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
                    {multiWarehouse && `${dock.warehouse.name} · `}
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
                    {dock.bookings.map((booking) => {
                      const commodityTag = booking.tags.find((t) => t.tag.category === "COMMODITY")?.tag;
                      return (
                        <li
                          key={booking.id}
                          className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"
                        >
                          <div className="flex flex-wrap items-center gap-3">
                            <span className="w-28 shrink-0 font-mono text-sm text-black dark:text-zinc-50">
                              {formatTime(booking.startTime)}–{formatTime(booking.endTime)}
                            </span>
                            <span className="text-sm text-black dark:text-zinc-50">{booking.carrier.name}</span>
                            <span className="text-xs text-zinc-500 dark:text-zinc-400">{booking.referenceNumber}</span>
                            {(booking.createdByStaff || booking.createdByCarrierUser) && (
                              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                                booked by {(booking.createdByStaff ?? booking.createdByCarrierUser)!.name}
                              </span>
                            )}
                            {commodityTag && (
                              <span className="text-xs text-zinc-500 dark:text-zinc-400">{commodityTag.name}</span>
                            )}
                            {booking.shipmentVolume !== null && (
                              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                                {booking.shipmentVolume} pallet{booking.shipmentVolume === 1 ? "" : "s"}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {PRIORITY_STYLES[booking.priority] && (
                              <span
                                className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_STYLES[booking.priority]}`}
                              >
                                {booking.priority}
                              </span>
                            )}
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
                            {booking.status === "SCHEDULED" && (
                              <form action={checkIn}>
                                <input type="hidden" name="bookingId" value={booking.id} />
                                <button
                                  type="submit"
                                  className="h-7 rounded-full border border-black/[.08] px-3 text-xs font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
                                >
                                  Check In
                                </button>
                              </form>
                            )}
                            {booking.status === "CHECKED_IN" && booking.checkedInAt && (
                              <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                                arrived {formatTime(booking.checkedInAt)}
                                {booking.checkedInByStaff && ` by ${booking.checkedInByStaff.name}`}
                              </span>
                            )}
                            {booking.status === "CHECKED_IN" && (
                              <form action={complete}>
                                <input type="hidden" name="bookingId" value={booking.id} />
                                <button
                                  type="submit"
                                  className="h-7 rounded-full border border-black/[.08] px-3 text-xs font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
                                >
                                  Complete
                                </button>
                              </form>
                            )}
                            {booking.status === "COMPLETED" && booking.completedAt && (
                              <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                                done {formatTime(booking.completedAt)}
                                {booking.checkedInAt &&
                                  ` (${Math.round((booking.completedAt.getTime() - booking.checkedInAt.getTime()) / 60000)} min)`}
                                {booking.completedByStaff && ` by ${booking.completedByStaff.name}`}
                              </span>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
