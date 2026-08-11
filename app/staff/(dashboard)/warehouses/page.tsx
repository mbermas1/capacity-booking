import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/portal-auth";
import { getStaffMember } from "@/lib/staff-session";
import { canCreateWarehouse } from "@/lib/staff-roles";
import { Prisma } from "@/app/generated/prisma/client";

async function createWarehouse(formData: FormData) {
  "use server";

  const staff = await getStaffMember();
  if (!staff || !canCreateWarehouse(staff.role)) return;

  const name = String(formData.get("name") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  const accountId = String(formData.get("accountId") ?? "").trim();
  const managerName = String(formData.get("managerName") ?? "").trim();
  const managerEmail = String(formData.get("managerEmail") ?? "").trim();
  const managerPassword = String(formData.get("managerPassword") ?? "");

  if (!name || !location || !accountId) return;

  const warehouse = await prisma.warehouse.create({
    data: { name, location, accountId, publicBookingSlug: randomBytes(16).toString("hex") },
  });

  if (managerName && managerEmail && managerPassword) {
    try {
      await prisma.staff.create({
        data: {
          name: managerName,
          email: managerEmail,
          passwordHash: hashPassword(managerPassword),
          role: "WAREHOUSE_MANAGER",
          accountId,
          warehouseId: warehouse.id,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        redirect(
          "/staff/warehouses?error=" +
            encodeURIComponent("Warehouse created, but a staff account with that manager email already exists."),
        );
      }
      throw error;
    }
  }

  revalidatePath("/staff/warehouses");
}

async function toggleWarehouseActive(warehouseId: string, currentlyActive: boolean) {
  "use server";

  const staff = await getStaffMember();
  if (!staff || !canCreateWarehouse(staff.role)) return;

  await prisma.warehouse.update({ where: { id: warehouseId }, data: { active: !currentlyActive } });

  revalidatePath("/staff/warehouses");
}

export default async function StaffWarehousesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const staff = await getStaffMember();
  if (!staff) return null;
  if (!canCreateWarehouse(staff.role)) {
    return <p className="text-sm text-zinc-600 dark:text-zinc-400">You don&apos;t have access to this page.</p>;
  }

  const { error } = await searchParams;

  const [warehouses, accounts] = await Promise.all([
    prisma.warehouse.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { docks: true, staff: true } }, account: { select: { name: true } } },
    }),
    prisma.account.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="flex flex-col gap-8">
      {error && (
        <p className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <section>
        <h1 className="mb-4 text-xl font-semibold text-black dark:text-zinc-50">Add a Warehouse</h1>
        {accounts.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-500">
            Create an Account first on the{" "}
            <a href="/staff/accounts" className="underline">
              Accounts
            </a>{" "}
            page.
          </p>
        ) : (
          <form
            action={createWarehouse}
            className="flex flex-col gap-4 rounded-2xl border border-black/[.08] bg-white p-5 dark:border-white/[.145] dark:bg-[#0a0a0a] sm:flex-row sm:flex-wrap sm:items-end"
          >
            <div className="flex flex-col gap-1">
              <label htmlFor="accountId" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Account
              </label>
              <select
                id="accountId"
                name="accountId"
                required
                className="h-10 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
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
            <div className="flex w-full flex-wrap items-end gap-4 border-t border-black/[.06] pt-4 dark:border-white/[.08]">
              <span className="w-full text-xs text-zinc-500 dark:text-zinc-500">
                Optional — assign an initial Warehouse Manager
              </span>
              <div className="flex flex-col gap-1">
                <label htmlFor="managerName" className="text-xs text-zinc-600 dark:text-zinc-400">
                  Manager Name
                </label>
                <input
                  id="managerName"
                  name="managerName"
                  type="text"
                  className="h-9 rounded-lg border border-black/[.08] bg-white px-2 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="managerEmail" className="text-xs text-zinc-600 dark:text-zinc-400">
                  Manager Email
                </label>
                <input
                  id="managerEmail"
                  name="managerEmail"
                  type="email"
                  className="h-9 rounded-lg border border-black/[.08] bg-white px-2 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="managerPassword" className="text-xs text-zinc-600 dark:text-zinc-400">
                  Manager Password
                </label>
                <input
                  id="managerPassword"
                  name="managerPassword"
                  type="password"
                  className="h-9 rounded-lg border border-black/[.08] bg-white px-2 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
                />
              </div>
            </div>
          </form>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium text-black dark:text-zinc-50">Warehouses</h2>
        {warehouses.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-500">No warehouses yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-black/[.06] rounded-2xl border border-black/[.08] bg-white px-4 dark:divide-white/[.08] dark:border-white/[.145] dark:bg-[#0a0a0a]">
            {warehouses.map((w) => {
              const boundToggle = toggleWarehouseActive.bind(null, w.id, w.active);
              return (
                <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="flex items-center gap-2 text-sm font-medium text-black dark:text-zinc-50">
                      {w.name} <span className="font-normal text-zinc-500 dark:text-zinc-400">· {w.account.name}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          w.active
                            ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
                            : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                        }`}
                      >
                        {w.active ? "Active" : "Inactive"}
                      </span>
                    </span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      {w.location} · {w._count.docks} dock{w._count.docks === 1 ? "" : "s"} · {w._count.staff} staff
                    </span>
                  </div>
                  <form action={boundToggle}>
                    <button
                      type="submit"
                      className="h-8 rounded-full border border-black/[.08] px-3 text-xs font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
                    >
                      {w.active ? "Deactivate" : "Reactivate"}
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
