import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getStaffMember } from "@/lib/staff-session";
import { canAccessWarehouse, canManageCapacityRules, getWarehouseScope } from "@/lib/staff-roles";
import { computeWarehouseLoad, type WarehouseLoad } from "@/lib/capacity-utilization";
import { activeLaborHeadcount, type LaborShiftLike } from "@/lib/booking-constraints";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function UtilizationBars({ hourly, capacityAt }: { hourly: WarehouseLoad["hourly"]; capacityAt: (hour: number) => number | null }) {
  const maxBookings = Math.max(1, ...hourly.map((h) => h.concurrentBookings));
  return (
    <div className="flex h-10 items-end gap-0.5">
      {hourly.map((h) => {
        const capacity = capacityAt(h.hour);
        const atCapacity = capacity !== null && h.concurrentBookings >= capacity;
        return (
          <div
            key={h.hour}
            title={`${String(h.hour).padStart(2, "0")}:00 — ${h.concurrentBookings} booked${capacity !== null ? ` / ${capacity} capacity` : ""}`}
            className={`flex-1 rounded-t ${
              h.concurrentBookings === 0
                ? "bg-zinc-200 dark:bg-zinc-700"
                : atCapacity
                  ? "bg-red-500 dark:bg-red-600"
                  : "bg-foreground"
            }`}
            style={{ height: `${Math.max(2, Math.round((h.concurrentBookings / maxBookings) * 100))}%` }}
          />
        );
      })}
    </div>
  );
}

async function updateYardCapacity(warehouseId: string, formData: FormData) {
  "use server";

  const staff = await getStaffMember();
  if (!staff || !canManageCapacityRules(staff.role) || !canAccessWarehouse(staff, warehouseId)) return;

  const slotsRaw = String(formData.get("trailerSlots") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!slotsRaw) {
    await prisma.yardCapacity.deleteMany({ where: { warehouseId } });
  } else {
    const trailerSlots = Number(slotsRaw);
    if (!Number.isInteger(trailerSlots) || trailerSlots < 0) return;
    await prisma.yardCapacity.upsert({
      where: { warehouseId },
      create: { warehouseId, trailerSlots, notes: notes || undefined },
      update: { trailerSlots, notes: notes || undefined },
    });
  }

  revalidatePath("/staff/capacity");
}

async function updateLaborShifts(warehouseId: string, formData: FormData) {
  "use server";

  const staff = await getStaffMember();
  if (!staff || !canManageCapacityRules(staff.role) || !canAccessWarehouse(staff, warehouseId)) return;

  const entries: { dayOfWeek: number; startTime: string; endTime: string; headcount: number }[] = [];

  for (let day = 0; day < 7; day++) {
    const mode = String(formData.get(`mode-${day}`) ?? "unrestricted");
    if (mode !== "shift") continue;

    const startTime = String(formData.get(`startTime-${day}`) ?? "");
    const endTime = String(formData.get(`endTime-${day}`) ?? "");
    const headcount = Number(String(formData.get(`headcount-${day}`) ?? ""));
    if (!startTime || !endTime || !Number.isInteger(headcount) || headcount < 0) continue;

    entries.push({ dayOfWeek: day, startTime, endTime, headcount });
  }

  await prisma.$transaction(async (tx) => {
    await tx.laborShift.deleteMany({ where: { warehouseId } });
    if (entries.length > 0) {
      await tx.laborShift.createMany({ data: entries.map((e) => ({ warehouseId, ...e })) });
    }
  });

  revalidatePath("/staff/capacity");
}

export default async function StaffCapacityPage() {
  const staff = await getStaffMember();
  if (!staff) return null;
  if (!canManageCapacityRules(staff.role)) {
    return <p className="text-sm text-zinc-600 dark:text-zinc-400">You don&apos;t have access to this page.</p>;
  }

  const scope = getWarehouseScope(staff);
  const warehouses = await prisma.warehouse.findMany({
    where: scope === null ? {} : { id: { in: scope } },
    orderBy: { name: "asc" },
    include: { yardCapacity: true, laborShifts: true },
  });

  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const loadByWarehouse = new Map(
    await Promise.all(
      warehouses.map(async (w) => {
        const configured = w.yardCapacity !== null || w.laborShifts.length > 0;
        return [w.id, configured ? await computeWarehouseLoad(w.id, todayStart, now) : null] as const;
      }),
    ),
  );

  return (
    <div className="flex flex-col gap-10">
      <h1 className="text-xl font-semibold text-black dark:text-zinc-50">Labor &amp; Yard Capacity</h1>
      <p className="-mt-6 text-sm text-zinc-600 dark:text-zinc-400">
        Bookings are rejected once the warehouse-wide overlap at a given moment reaches scheduled labor headcount
        or yard trailer slots. Leave unconfigured to stay unrestricted.
      </p>

      {warehouses.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-500">No warehouses available.</p>
      ) : (
        warehouses.map((w) => {
          const shiftsByDay = new Map(w.laborShifts.map((s) => [s.dayOfWeek, s]));
          const load = loadByWarehouse.get(w.id) ?? null;
          const laborShiftLikes: LaborShiftLike[] = w.laborShifts;
          return (
            <section key={w.id} className="flex flex-col gap-4">
              <h2 className="text-lg font-medium text-black dark:text-zinc-50">{w.name}</h2>

              {load && (
                <div className="flex flex-col gap-4 rounded-2xl border border-black/[.08] bg-white p-5 dark:border-white/[.145] dark:bg-[#0a0a0a]">
                  <h3 className="text-sm font-medium text-black dark:text-zinc-50">Today&rsquo;s Load (UTC)</h3>
                  {w.yardCapacity && (
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-zinc-600 dark:text-zinc-400">
                        Yard: {load.currentBookings} of {w.yardCapacity.trailerSlots} slot
                        {w.yardCapacity.trailerSlots === 1 ? "" : "s"} in use now
                      </span>
                      <UtilizationBars hourly={load.hourly} capacityAt={() => w.yardCapacity!.trailerSlots} />
                    </div>
                  )}
                  {w.laborShifts.length > 0 && (
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-zinc-600 dark:text-zinc-400">
                        {(() => {
                          const nowHeadcount = activeLaborHeadcount(laborShiftLikes, now);
                          return nowHeadcount === null
                            ? "Labor: no shift scheduled right now"
                            : `Labor: ${load.currentBookings} of ${nowHeadcount} worker${nowHeadcount === 1 ? "" : "s"} in use now`;
                        })()}
                      </span>
                      <UtilizationBars
                        hourly={load.hourly}
                        capacityAt={(hour) =>
                          activeLaborHeadcount(laborShiftLikes, new Date(todayStart.getTime() + hour * 60 * 60 * 1000))
                        }
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="rounded-2xl border border-black/[.08] bg-white p-5 dark:border-white/[.145] dark:bg-[#0a0a0a]">
                <h3 className="mb-3 text-sm font-medium text-black dark:text-zinc-50">Yard Capacity</h3>
                <form action={updateYardCapacity.bind(null, w.id)} className="flex flex-wrap items-end gap-2">
                  <div className="flex flex-col gap-1">
                    <label htmlFor={`trailerSlots-${w.id}`} className="text-xs text-zinc-600 dark:text-zinc-400">
                      Trailer Slots (blank = unrestricted)
                    </label>
                    <input
                      id={`trailerSlots-${w.id}`}
                      type="number"
                      name="trailerSlots"
                      min="0"
                      defaultValue={w.yardCapacity?.trailerSlots ?? ""}
                      className="h-9 w-40 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor={`notes-${w.id}`} className="text-xs text-zinc-600 dark:text-zinc-400">
                      Notes (optional)
                    </label>
                    <input
                      id={`notes-${w.id}`}
                      type="text"
                      name="notes"
                      defaultValue={w.yardCapacity?.notes ?? ""}
                      className="h-9 w-56 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
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

              <div className="rounded-2xl border border-black/[.08] bg-white p-5 dark:border-white/[.145] dark:bg-[#0a0a0a]">
                <h3 className="mb-3 text-sm font-medium text-black dark:text-zinc-50">Labor Shifts (UTC)</h3>
                <form action={updateLaborShifts.bind(null, w.id)} className="flex flex-col gap-3">
                  {DAY_NAMES.map((dayName, day) => {
                    const existing = shiftsByDay.get(day);
                    const defaultMode = existing ? "shift" : "unrestricted";
                    return (
                      <div key={day} className="flex flex-wrap items-center gap-3">
                        <span className="w-24 shrink-0 text-sm text-black dark:text-zinc-50">{dayName}</span>
                        <select
                          name={`mode-${day}`}
                          defaultValue={defaultMode}
                          className="h-9 rounded-lg border border-black/[.08] bg-white px-2 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
                        >
                          <option value="unrestricted">Unrestricted</option>
                          <option value="shift">Shift</option>
                        </select>
                        <input
                          type="time"
                          name={`startTime-${day}`}
                          defaultValue={existing?.startTime ?? ""}
                          className="h-9 rounded-lg border border-black/[.08] bg-white px-2 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
                        />
                        <span className="text-sm text-zinc-500 dark:text-zinc-400">to</span>
                        <input
                          type="time"
                          name={`endTime-${day}`}
                          defaultValue={existing?.endTime ?? ""}
                          className="h-9 rounded-lg border border-black/[.08] bg-white px-2 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
                        />
                        <input
                          type="number"
                          name={`headcount-${day}`}
                          min="0"
                          placeholder="Workers"
                          defaultValue={existing?.headcount ?? ""}
                          className="h-9 w-24 rounded-lg border border-black/[.08] bg-white px-2 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
                        />
                      </div>
                    );
                  })}
                  <button
                    type="submit"
                    className="mt-2 h-10 w-fit rounded-full bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
                  >
                    Save Shifts
                  </button>
                </form>
                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">
                  One shift per day. &ldquo;Unrestricted&rdquo; days have no labor constraint.
                </p>
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
