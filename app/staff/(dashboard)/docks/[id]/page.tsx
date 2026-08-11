import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { TagCategory } from "@/app/generated/prisma/client";
import { getStaffMember } from "@/lib/staff-session";
import { canAccessWarehouse, canManageCapacityRules } from "@/lib/staff-roles";
import { computeDockDwellStats, computeDockDwellTrend } from "@/lib/dock-dwell";
import { DOCK_TYPE_LABELS, isDockType } from "@/lib/dock-type";

async function assertDockAccess(dockId: string): Promise<boolean> {
  const staff = await getStaffMember();
  if (!staff || !canManageCapacityRules(staff.role)) return false;
  const dock = await prisma.dock.findUnique({ where: { id: dockId }, select: { warehouseId: true } });
  return dock !== null && canAccessWarehouse(staff, dock.warehouseId);
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const CATEGORY_LABELS: Record<string, string> = {
  EQUIPMENT: "Equipment",
  COMMODITY: "Commodity (accepted)",
  CARRIER_REQUIREMENT: "Carrier Requirement",
};

function parseOptionalNonNegativeInt(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isInteger(value) && value >= 0 ? value : null;
}

async function updateDockDetails(dockId: string, formData: FormData) {
  "use server";

  if (!(await assertDockAccess(dockId))) return;

  const name = String(formData.get("name") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  const dockType = formData.get("dockType");
  const capacityRaw = String(formData.get("capacity") ?? "").trim();
  const capacity = Number.isInteger(Number(capacityRaw)) && Number(capacityRaw) >= 1 ? Number(capacityRaw) : 1;
  const minLeadTimeMinutes = parseOptionalNonNegativeInt(String(formData.get("minLeadTimeMinutes") ?? ""));
  const bufferMinutes = parseOptionalNonNegativeInt(String(formData.get("bufferMinutes") ?? ""));
  const reservedHighPrioritySlots = parseOptionalNonNegativeInt(String(formData.get("reservedHighPrioritySlots") ?? ""));
  const requiresManualReview = formData.get("requiresManualReview") === "on";

  if (!name || !location || !isDockType(dockType)) return;

  await prisma.dock.update({
    where: { id: dockId },
    data: {
      name,
      location,
      dockType,
      capacity,
      minLeadTimeMinutes,
      bufferMinutes,
      reservedHighPrioritySlots,
      requiresManualReview,
    },
  });
  revalidatePath(`/staff/docks/${dockId}`);
}

async function updateHours(dockId: string, formData: FormData) {
  "use server";

  if (!(await assertDockAccess(dockId))) return;

  const entries: { dayOfWeek: number; closed: boolean; openTime: string | null; closeTime: string | null }[] = [];
  const daysToKeep: number[] = [];

  for (let day = 0; day < 7; day++) {
    const mode = String(formData.get(`mode-${day}`) ?? "unrestricted");
    if (mode === "unrestricted") continue;

    daysToKeep.push(day);
    if (mode === "closed") {
      entries.push({ dayOfWeek: day, closed: true, openTime: null, closeTime: null });
    } else {
      const openTime = String(formData.get(`openTime-${day}`) ?? "");
      const closeTime = String(formData.get(`closeTime-${day}`) ?? "");
      if (!openTime || !closeTime) continue;
      entries.push({ dayOfWeek: day, closed: false, openTime, closeTime });
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.dockOperatingHours.deleteMany({ where: { dockId, dayOfWeek: { notIn: daysToKeep } } });
    for (const entry of entries) {
      await tx.dockOperatingHours.upsert({
        where: { dockId_dayOfWeek: { dockId, dayOfWeek: entry.dayOfWeek } },
        create: { dockId, ...entry },
        update: entry,
      });
    }
  });

  revalidatePath(`/staff/docks/${dockId}`);
}

async function updateTags(dockId: string, category: TagCategory, formData: FormData) {
  "use server";

  if (!(await assertDockAccess(dockId))) return;

  const selectedTagIds = formData.getAll("tagIds").map(String);

  await prisma.$transaction(async (tx) => {
    await tx.dockTag.deleteMany({ where: { dockId, tag: { category } } });
    if (selectedTagIds.length > 0) {
      await tx.dockTag.createMany({
        data: selectedTagIds.map((tagId) => ({ dockId, tagId })),
      });
    }
  });

  revalidatePath(`/staff/docks/${dockId}`);
}

export default async function StaffDockDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: dockId } = await params;

  const staff = await getStaffMember();
  if (!staff) return null;

  const dock = await prisma.dock.findUnique({
    where: { id: dockId },
    include: {
      operatingHours: true,
      tags: { include: { tag: true } },
    },
  });

  if (!dock) notFound();
  if (!canManageCapacityRules(staff.role) || !canAccessWarehouse(staff, dock.warehouseId)) {
    return <p className="text-sm text-zinc-600 dark:text-zinc-400">You don&apos;t have access to this page.</p>;
  }

  const allTags = await prisma.tag.findMany({ where: { accountId: staff.accountId! }, orderBy: { name: "asc" } });
  const hoursByDay = new Map(dock.operatingHours.map((h) => [h.dayOfWeek, h]));
  const assignedTagIds = new Set(dock.tags.map((dt) => dt.tagId));
  const dwell = await computeDockDwellStats(dockId);
  const dwellTrend = await computeDockDwellTrend(dockId);
  const maxDwell = Math.max(1, ...dwellTrend.map((b) => b.averageDwellMinutes ?? 0));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/staff/docks" className="text-sm text-zinc-500 hover:underline dark:text-zinc-400">
          ← Docks
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-black dark:text-zinc-50">{dock.name}</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {dwell.averageDwellMinutes !== null
            ? `Avg dwell: ${Math.round(dwell.averageDwellMinutes)} min (scheduled: ${Math.round(dwell.averageScheduledMinutes!)} min) · ${dwell.sampleSize} completed bookings`
            : "Not enough completed bookings yet for a dwell-time average"}
        </p>
        <div className="mt-2 flex h-10 items-end gap-0.5">
          {dwellTrend.map((b) => (
            <div
              key={b.periodStart}
              title={
                b.averageDwellMinutes !== null
                  ? `${b.periodStart} – ${b.periodEnd}: avg ${Math.round(b.averageDwellMinutes)} min vs ${Math.round(b.averageScheduledMinutes!)} min scheduled`
                  : `${b.periodStart} – ${b.periodEnd}: insufficient data`
              }
              className={`flex-1 rounded-t ${
                b.averageDwellMinutes !== null ? "bg-foreground" : "bg-zinc-200 dark:bg-zinc-700"
              }`}
              style={{
                height: `${
                  b.averageDwellMinutes !== null ? Math.max(2, Math.round((b.averageDwellMinutes / maxDwell) * 100)) : 2
                }%`,
              }}
            />
          ))}
        </div>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-medium text-black dark:text-zinc-50">Details</h2>
        <form
          action={updateDockDetails.bind(null, dockId)}
          className="flex flex-col gap-4 rounded-2xl border border-black/[.08] bg-white p-5 dark:border-white/[.145] dark:bg-[#0a0a0a] sm:flex-row sm:flex-wrap sm:items-end"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="name" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              defaultValue={dock.name}
              required
              className="h-10 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="location" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Location
            </label>
            <input
              id="location"
              name="location"
              type="text"
              defaultValue={dock.location}
              required
              className="h-10 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="dockType" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Dock Type
            </label>
            <select
              id="dockType"
              name="dockType"
              defaultValue={dock.dockType}
              required
              className="h-10 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            >
              {Object.entries(DOCK_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="capacity" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Capacity
            </label>
            <input
              id="capacity"
              name="capacity"
              type="number"
              min="1"
              defaultValue={dock.capacity}
              className="h-10 w-24 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="minLeadTimeMinutes" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Minimum Lead Time (minutes, optional)
            </label>
            <input
              id="minLeadTimeMinutes"
              name="minLeadTimeMinutes"
              type="number"
              min="0"
              defaultValue={dock.minLeadTimeMinutes ?? ""}
              className="h-10 w-24 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="bufferMinutes" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Buffer Time (minutes, optional)
            </label>
            <input
              id="bufferMinutes"
              name="bufferMinutes"
              type="number"
              min="0"
              defaultValue={dock.bufferMinutes ?? ""}
              className="h-10 w-24 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="reservedHighPrioritySlots" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Reserved for High Priority (slots, optional)
            </label>
            <input
              id="reservedHighPrioritySlots"
              name="reservedHighPrioritySlots"
              type="number"
              min="0"
              defaultValue={dock.reservedHighPrioritySlots ?? ""}
              className="h-10 w-24 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              name="requiresManualReview"
              defaultChecked={dock.requiresManualReview}
            />
            Require manual review for public booking requests
          </label>
          <button
            type="submit"
            className="h-10 rounded-full bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            Save
          </button>
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium text-black dark:text-zinc-50">Operating Hours (UTC)</h2>
        <form
          action={updateHours.bind(null, dockId)}
          className="flex flex-col gap-3 rounded-2xl border border-black/[.08] bg-white p-5 dark:border-white/[.145] dark:bg-[#0a0a0a]"
        >
          {DAY_NAMES.map((dayName, day) => {
            const existing = hoursByDay.get(day);
            const defaultMode = !existing ? "unrestricted" : existing.closed ? "closed" : "hours";
            return (
              <div key={day} className="flex flex-wrap items-center gap-3">
                <span className="w-24 shrink-0 text-sm text-black dark:text-zinc-50">{dayName}</span>
                <select
                  name={`mode-${day}`}
                  defaultValue={defaultMode}
                  className="h-9 rounded-lg border border-black/[.08] bg-white px-2 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
                >
                  <option value="unrestricted">Unrestricted</option>
                  <option value="closed">Closed</option>
                  <option value="hours">Specific hours</option>
                </select>
                <input
                  type="time"
                  name={`openTime-${day}`}
                  defaultValue={existing?.openTime ?? ""}
                  className="h-9 rounded-lg border border-black/[.08] bg-white px-2 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
                />
                <span className="text-sm text-zinc-500 dark:text-zinc-400">to</span>
                <input
                  type="time"
                  name={`closeTime-${day}`}
                  defaultValue={existing?.closeTime ?? ""}
                  className="h-9 rounded-lg border border-black/[.08] bg-white px-2 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
                />
              </div>
            );
          })}
          <button
            type="submit"
            className="mt-2 h-10 w-fit rounded-full bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            Save Hours
          </button>
        </form>
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">
          &ldquo;Unrestricted&rdquo; days accept bookings any time. Times are only used when a day is set to
          &ldquo;Specific hours&rdquo;.
        </p>
      </section>

      {Object.values(TagCategory).map((category) => {
        const categoryTags = allTags.filter((t) => t.category === category);
        return (
          <section key={category}>
            <h2 className="mb-3 text-lg font-medium text-black dark:text-zinc-50">{CATEGORY_LABELS[category]} Tags</h2>
            {categoryTags.length === 0 ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-500">
                No {CATEGORY_LABELS[category].toLowerCase()} tags exist yet. Create one on the Tags page.
              </p>
            ) : (
              <form
                action={updateTags.bind(null, dockId, category)}
                className="flex flex-col gap-3 rounded-2xl border border-black/[.08] bg-white p-5 dark:border-white/[.145] dark:bg-[#0a0a0a]"
              >
                <div className="flex flex-wrap gap-4">
                  {categoryTags.map((tag) => (
                    <label key={tag.id} className="flex items-center gap-2 text-sm text-black dark:text-zinc-50">
                      <input
                        type="checkbox"
                        name="tagIds"
                        value={tag.id}
                        defaultChecked={assignedTagIds.has(tag.id)}
                      />
                      {tag.name}
                    </label>
                  ))}
                </div>
                <button
                  type="submit"
                  className="h-9 w-fit rounded-full border border-black/[.08] px-4 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
                >
                  Save {CATEGORY_LABELS[category]} Tags
                </button>
              </form>
            )}
          </section>
        );
      })}
    </div>
  );
}
