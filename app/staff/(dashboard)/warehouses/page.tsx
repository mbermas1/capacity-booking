import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Building2, Warehouse as WarehouseIcon } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/portal-auth";
import { getStaffMember } from "@/lib/staff-session";
import { canCreateWarehouse } from "@/lib/staff-roles";
import { SortableHeader } from "@/components/sortable-header";
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
  redirect("/staff/warehouses?message=" + encodeURIComponent("Warehouse created."));
}

async function toggleWarehouseActive(warehouseId: string, currentlyActive: boolean) {
  "use server";

  const staff = await getStaffMember();
  if (!staff || !canCreateWarehouse(staff.role)) return;

  await prisma.warehouse.update({ where: { id: warehouseId }, data: { active: !currentlyActive } });

  revalidatePath("/staff/warehouses");
}

const GRID_COLS = "grid-cols-[2fr_1.5fr_1.5fr_1fr_1fr_1fr_auto]";

export default async function StaffWarehousesPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    message?: string;
    q?: string;
    accountId?: string;
    status?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const staff = await getStaffMember();
  if (!staff) return null;
  if (!canCreateWarehouse(staff.role)) {
    return <p className="text-sm text-zinc-600 dark:text-zinc-400">You don&apos;t have access to this page.</p>;
  }

  const params = await searchParams;
  const { error, message, q, accountId, status } = params;

  const accounts = await prisma.account.findMany({ orderBy: { name: "asc" } });

  const warehouses = await prisma.warehouse.findMany({
    where: {
      ...(q ? { OR: [{ name: { contains: q } }, { location: { contains: q } }] } : {}),
      ...(accountId ? { accountId } : {}),
      ...(status === "active" ? { active: true } : status === "inactive" ? { active: false } : {}),
    },
    orderBy: { name: "asc" },
    include: { _count: { select: { docks: true, staff: true } }, account: { select: { name: true } } },
  });

  const sorted = [...warehouses].sort((a, b) => {
    const dir = params.dir === "desc" ? -1 : 1;
    switch (params.sort) {
      case "account":
        return a.account.name.localeCompare(b.account.name) * dir;
      case "location":
        return a.location.localeCompare(b.location) * dir;
      case "docks":
        return (a._count.docks - b._count.docks) * dir;
      case "staff":
        return (a._count.staff - b._count.staff) * dir;
      case "status":
        return (Number(a.active) - Number(b.active)) * dir;
      default:
        return a.name.localeCompare(b.name) * dir;
    }
  });

  return (
    <div className="flex flex-col gap-6">
      {message && (
        <p className="rounded-lg bg-green-100 px-3 py-2 text-sm text-green-800 dark:bg-green-950 dark:text-green-300">
          {message}
        </p>
      )}
      {error && (
        <p className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">Warehouses</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Manage warehouses across every account</p>
        </div>
        {accounts.length > 0 && (
          <button
            popoverTarget="add-warehouse-popover"
            className="h-10 rounded-full bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            + Add Warehouse
          </button>
        )}
      </div>

      {accounts.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-500">
          Create an Account first on the{" "}
          <a href="/staff/accounts" className="underline">
            Accounts
          </a>{" "}
          page.
        </p>
      ) : (
        <div
          id="add-warehouse-popover"
          popover="auto"
          className="w-full max-w-lg rounded-2xl border border-black/[.08] bg-white shadow-xl dark:border-white/[.145] dark:bg-[#0a0a0a]"
        >
          <div className="flex items-start gap-3 border-b border-black/[.06] p-5 dark:border-white/[.08]">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
              <WarehouseIcon className="h-4.5 w-4.5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-black dark:text-zinc-50">Add Warehouse</h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Optionally assign its first Warehouse Manager</p>
            </div>
          </div>
          <form action={createWarehouse} className="flex flex-col gap-4 p-5">
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
            <div className="flex gap-4">
              <div className="flex flex-1 flex-col gap-1">
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
              <div className="flex flex-1 flex-col gap-1">
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
            </div>

            <div className="flex flex-col gap-3 border-t border-black/[.06] pt-4 dark:border-white/[.08]">
              <span className="text-xs text-zinc-500 dark:text-zinc-500">
                Optional — assign an initial Warehouse Manager
              </span>
              <div className="flex gap-4">
                <div className="flex flex-1 flex-col gap-1">
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
                <div className="flex flex-1 flex-col gap-1">
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
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="managerPassword" className="text-xs text-zinc-600 dark:text-zinc-400">
                  Manager Password
                </label>
                <input
                  id="managerPassword"
                  name="managerPassword"
                  type="password"
                  className="h-9 w-full rounded-lg border border-black/[.08] bg-white px-2 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-black/[.06] pt-4 dark:border-white/[.08]">
              <button
                type="button"
                popoverTarget="add-warehouse-popover"
                popoverTargetAction="hide"
                className="h-10 rounded-full border border-black/[.08] px-4 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="h-10 rounded-full bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
              >
                Add Warehouse
              </button>
            </div>
          </form>
        </div>
      )}

      <form method="get" className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search by name or location..."
          className="h-10 w-full max-w-sm rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
        />
        <select
          name="accountId"
          defaultValue={accountId ?? ""}
          className="h-10 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
        >
          <option value="">All accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={status ?? ""}
          className="h-10 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <button
          type="submit"
          className="h-10 rounded-lg border border-black/[.08] px-4 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
        >
          Apply
        </button>
      </form>

      <div className="overflow-hidden rounded-2xl border border-black/[.08] bg-white dark:border-white/[.145] dark:bg-[#0a0a0a]">
        <div
          className={`grid ${GRID_COLS} gap-4 border-b border-black/[.06] px-4 py-2 text-xs font-medium text-zinc-500 dark:border-white/[.08] dark:text-zinc-400`}
        >
          <SortableHeader label="Name" sortKey="name" basePath="/staff/warehouses" searchParams={params} />
          <SortableHeader label="Account" sortKey="account" basePath="/staff/warehouses" searchParams={params} />
          <SortableHeader label="Location" sortKey="location" basePath="/staff/warehouses" searchParams={params} />
          <SortableHeader label="Docks" sortKey="docks" basePath="/staff/warehouses" searchParams={params} />
          <SortableHeader label="Staff" sortKey="staff" basePath="/staff/warehouses" searchParams={params} />
          <SortableHeader label="Status" sortKey="status" basePath="/staff/warehouses" searchParams={params} />
          <span />
        </div>

        {sorted.length === 0 ? (
          <p className="p-4 text-sm text-zinc-500 dark:text-zinc-500">No warehouses found.</p>
        ) : (
          sorted.map((w) => {
            const boundToggle = toggleWarehouseActive.bind(null, w.id, w.active);
            return (
              <div
                key={w.id}
                className={`grid ${GRID_COLS} items-center gap-4 border-b border-black/[.06] px-4 py-3 text-sm last:border-b-0 dark:border-white/[.08]`}
              >
                <span className="font-medium text-black dark:text-zinc-50">{w.name}</span>
                <span className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
                  <Building2 className="h-3.5 w-3.5 shrink-0" />
                  {w.account.name}
                </span>
                <span className="text-zinc-600 dark:text-zinc-400">{w.location}</span>
                <span className="text-zinc-600 dark:text-zinc-400">{w._count.docks}</span>
                <span className="text-zinc-600 dark:text-zinc-400">{w._count.staff}</span>
                <span>
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
                <form action={boundToggle}>
                  <button
                    type="submit"
                    className="h-8 rounded-full border border-black/[.08] px-3 text-xs font-medium whitespace-nowrap transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
                  >
                    {w.active ? "Deactivate" : "Reactivate"}
                  </button>
                </form>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
