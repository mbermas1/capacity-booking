import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getStaffMember } from "@/lib/staff-session";
import { canCreateWarehouse } from "@/lib/staff-roles";

async function createWarehouse(formData: FormData) {
  "use server";

  const staff = await getStaffMember();
  if (!staff || !canCreateWarehouse(staff.role)) return;

  const name = String(formData.get("name") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();

  if (!name || !location) return;

  await prisma.warehouse.create({
    data: { name, location, publicBookingSlug: randomBytes(16).toString("hex") },
  });

  revalidatePath("/staff/warehouses");
}

export default async function StaffWarehousesPage() {
  const staff = await getStaffMember();
  if (!staff) return null;
  if (!canCreateWarehouse(staff.role)) {
    return <p className="text-sm text-zinc-600 dark:text-zinc-400">You don&apos;t have access to this page.</p>;
  }

  const warehouses = await prisma.warehouse.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { docks: true, staff: true } } },
  });

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="mb-4 text-xl font-semibold text-black dark:text-zinc-50">Add a Warehouse</h1>
        <form
          action={createWarehouse}
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
          <button
            type="submit"
            className="h-10 rounded-full bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            Add Warehouse
          </button>
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium text-black dark:text-zinc-50">Warehouses</h2>
        {warehouses.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-500">No warehouses yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-black/[.06] rounded-2xl border border-black/[.08] bg-white px-4 dark:divide-white/[.08] dark:border-white/[.145] dark:bg-[#0a0a0a]">
            {warehouses.map((w) => (
              <li key={w.id} className="flex flex-col gap-0.5 py-3">
                <span className="text-sm font-medium text-black dark:text-zinc-50">{w.name}</span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {w.location} · {w._count.docks} dock{w._count.docks === 1 ? "" : "s"} · {w._count.staff} staff
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
