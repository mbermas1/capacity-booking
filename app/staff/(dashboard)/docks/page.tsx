import Link from "next/link";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getStaffMember } from "@/lib/staff-session";

async function createDock(formData: FormData) {
  "use server";

  const staff = await getStaffMember();
  if (!staff) return;

  const name = String(formData.get("name") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  const equipmentType = String(formData.get("equipmentType") ?? "").trim();

  if (!name || !location || !equipmentType) return;

  await prisma.dock.create({
    data: { name, location, equipmentType, warehouseId: staff.warehouseId },
  });

  revalidatePath("/staff/docks");
}

export default async function StaffDocksPage() {
  const staff = await getStaffMember();
  if (!staff) return null;

  const docks = await prisma.dock.findMany({
    where: { warehouseId: staff.warehouseId },
    orderBy: { name: "asc" },
    include: { _count: { select: { bookings: true, operatingHours: true, tags: true } } },
  });

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="mb-4 text-xl font-semibold text-black dark:text-zinc-50">Add a Dock</h1>
        <form
          action={createDock}
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
              required
              className="h-10 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="equipmentType" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Equipment Type
            </label>
            <input
              id="equipmentType"
              name="equipmentType"
              type="text"
              required
              className="h-10 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            />
          </div>
          <button
            type="submit"
            className="h-10 rounded-full bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            Add Dock
          </button>
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium text-black dark:text-zinc-50">Docks at {staff.warehouse?.name}</h2>
        {docks.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-500">No docks yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-black/[.06] rounded-2xl border border-black/[.08] bg-white px-4 dark:divide-white/[.08] dark:border-white/[.145] dark:bg-[#0a0a0a]">
            {docks.map((dock) => (
              <li key={dock.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="flex flex-col gap-0.5">
                  <Link
                    href={`/staff/docks/${dock.id}`}
                    className="text-sm font-medium text-black hover:underline dark:text-zinc-50"
                  >
                    {dock.name}
                  </Link>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {dock.location} · {dock.equipmentType} · {dock._count.bookings} booking
                    {dock._count.bookings === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                  <span>{dock._count.operatingHours > 0 ? "Hours set" : "No hours configured"}</span>
                  <span>·</span>
                  <span>{dock._count.tags} tag{dock._count.tags === 1 ? "" : "s"}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
