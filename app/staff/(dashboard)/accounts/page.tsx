import { Fragment } from "react";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ChevronDown, Landmark, Pencil } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/portal-auth";
import { getStaffMember } from "@/lib/staff-session";
import { canAssignWarehouseManager, canCreateAccount } from "@/lib/staff-roles";
import { SortableHeader } from "@/components/sortable-header";
import { Prisma } from "@/app/generated/prisma/client";

async function createAccount(formData: FormData) {
  "use server";

  const staff = await getStaffMember();
  if (!staff || !canCreateAccount(staff.role)) return;

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  await prisma.account.create({ data: { name } });

  revalidatePath("/staff/accounts");
  redirect("/staff/accounts?message=" + encodeURIComponent("Account created."));
}

async function updateAccount(accountId: string, formData: FormData) {
  "use server";

  const staff = await getStaffMember();
  if (!staff || !canCreateAccount(staff.role)) return;

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  await prisma.account.update({ where: { id: accountId }, data: { name } });

  revalidatePath("/staff/accounts");
  redirect("/staff/accounts?message=" + encodeURIComponent("Account updated."));
}

async function toggleAccountActive(accountId: string, currentlyActive: boolean) {
  "use server";

  const staff = await getStaffMember();
  if (!staff || !canCreateAccount(staff.role)) return;

  await prisma.account.update({ where: { id: accountId }, data: { active: !currentlyActive } });

  revalidatePath("/staff/accounts");
}

async function assignWarehouseManager(accountId: string, formData: FormData) {
  "use server";

  const staff = await getStaffMember();
  if (!staff || !canAssignWarehouseManager(staff.role)) return;

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const warehouseId = String(formData.get("warehouseId") ?? "").trim();
  const additionalWarehouseIds = formData
    .getAll("additionalWarehouseIds")
    .map(String)
    .filter((id) => id !== warehouseId);

  if (!name || !email || !password || !warehouseId) {
    redirect("/staff/accounts?error=" + encodeURIComponent("Name, email, password, and warehouse are required."));
  }

  const warehouse = await prisma.warehouse.findUnique({ where: { id: warehouseId }, select: { accountId: true } });
  if (!warehouse || warehouse.accountId !== accountId) {
    redirect("/staff/accounts?error=" + encodeURIComponent("That warehouse doesn't belong to this account."));
  }

  try {
    const created = await prisma.staff.create({
      data: {
        name,
        email,
        passwordHash: hashPassword(password),
        role: "WAREHOUSE_MANAGER",
        accountId,
        warehouseId,
      },
    });
    if (additionalWarehouseIds.length > 0) {
      const validIds = await prisma.warehouse.findMany({
        where: { id: { in: additionalWarehouseIds }, accountId },
        select: { id: true },
      });
      await prisma.staffWarehouse.createMany({
        data: validIds.map((w) => ({ staffId: created.id, warehouseId: w.id })),
      });
    }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      redirect("/staff/accounts?error=" + encodeURIComponent("A staff account with this email already exists."));
    }
    throw error;
  }

  revalidatePath("/staff/accounts");
  redirect("/staff/accounts?message=" + encodeURIComponent("Warehouse Manager assigned."));
}

async function updateWarehouseManager(accountId: string, staffId: string, formData: FormData) {
  "use server";

  const staff = await getStaffMember();
  if (!staff || !canAssignWarehouseManager(staff.role)) return;

  const target = await prisma.staff.findUnique({ where: { id: staffId }, select: { accountId: true, role: true } });
  if (!target || target.accountId !== accountId || target.role !== "WAREHOUSE_MANAGER") return;

  const warehouseId = String(formData.get("warehouseId") ?? "").trim();
  const additionalWarehouseIds = formData
    .getAll("additionalWarehouseIds")
    .map(String)
    .filter((id) => id !== warehouseId);
  const newPassword = String(formData.get("password") ?? "").trim();

  if (!warehouseId) return;

  const warehouse = await prisma.warehouse.findUnique({ where: { id: warehouseId }, select: { accountId: true } });
  if (!warehouse || warehouse.accountId !== accountId) return;

  await prisma.$transaction(async (tx) => {
    await tx.staff.update({
      where: { id: staffId },
      data: {
        warehouseId,
        ...(newPassword ? { passwordHash: hashPassword(newPassword) } : {}),
      },
    });
    await tx.staffWarehouse.deleteMany({ where: { staffId } });
    if (additionalWarehouseIds.length > 0) {
      const validIds = await tx.warehouse.findMany({
        where: { id: { in: additionalWarehouseIds }, accountId },
        select: { id: true },
      });
      await tx.staffWarehouse.createMany({
        data: validIds.map((w) => ({ staffId, warehouseId: w.id })),
      });
    }
  });

  revalidatePath("/staff/accounts");
  redirect("/staff/accounts?message=" + encodeURIComponent("Warehouse Manager updated."));
}

async function removeWarehouseManager(accountId: string, staffId: string) {
  "use server";

  const staff = await getStaffMember();
  if (!staff || !canAssignWarehouseManager(staff.role)) return;

  const target = await prisma.staff.findUnique({ where: { id: staffId }, select: { accountId: true, role: true } });
  if (!target || target.accountId !== accountId || target.role !== "WAREHOUSE_MANAGER") return;

  const managerCount = await prisma.staff.count({ where: { accountId, role: "WAREHOUSE_MANAGER" } });
  if (managerCount <= 1) {
    redirect(
      "/staff/accounts?error=" +
        encodeURIComponent("Can't remove the last Warehouse Manager for this account — assign a replacement first."),
    );
  }

  await prisma.staff.delete({ where: { id: staffId } });

  revalidatePath("/staff/accounts");
  redirect("/staff/accounts?message=" + encodeURIComponent("Warehouse Manager removed."));
}

const GRID_COLS = "grid-cols-[2fr_1fr_1fr_1.5fr_1fr_auto_1.5rem]";

export default async function StaffAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; error?: string; q?: string; sort?: string; dir?: string }>;
}) {
  const staff = await getStaffMember();
  if (!staff) return null;
  if (!canCreateAccount(staff.role)) {
    return <p className="text-sm text-zinc-600 dark:text-zinc-400">You don&apos;t have access to this page.</p>;
  }

  const params = await searchParams;
  const { message, error, q } = params;

  const accounts = await prisma.account.findMany({
    where: q ? { name: { contains: q } } : undefined,
    orderBy: { name: "asc" },
    include: {
      warehouses: { orderBy: { name: "asc" } },
      staff: {
        where: { role: "WAREHOUSE_MANAGER" },
        orderBy: { name: "asc" },
        include: { warehouse: true, warehouseAccess: { include: { warehouse: true } } },
      },
      _count: { select: { warehouses: true, staff: true } },
    },
  });

  const sorted = [...accounts].sort((a, b) => {
    const dir = params.dir === "desc" ? -1 : 1;
    switch (params.sort) {
      case "warehouses":
        return (a._count.warehouses - b._count.warehouses) * dir;
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
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">Accounts</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Manage tenant accounts and their Warehouse Managers</p>
        </div>
        <button
          popoverTarget="add-account-popover"
          className="h-10 rounded-full bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
        >
          + Add Account
        </button>
      </div>

      <div
        id="add-account-popover"
        popover="auto"
        className="w-full max-w-md rounded-2xl border border-black/[.08] bg-white shadow-xl dark:border-white/[.145] dark:bg-[#0a0a0a]"
      >
        <div className="flex items-start gap-3 border-b border-black/[.06] p-5 dark:border-white/[.08]">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
            <Landmark className="h-4.5 w-4.5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-black dark:text-zinc-50">Add Account</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Create a new tenant account</p>
          </div>
        </div>
        <form action={createAccount} className="flex flex-col gap-4 p-5">
          <div className="flex flex-col gap-1">
            <label htmlFor="name" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Account Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              className="h-10 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            />
          </div>
          <div className="flex justify-end gap-2 border-t border-black/[.06] pt-4 dark:border-white/[.08]">
            <button
              type="button"
              popoverTarget="add-account-popover"
              popoverTargetAction="hide"
              className="h-10 rounded-full border border-black/[.08] px-4 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="h-10 rounded-full bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
            >
              Add Account
            </button>
          </div>
        </form>
      </div>

      <form method="get" className="flex items-center gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search by account name..."
          className="h-10 w-full max-w-sm rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
        />
        <button
          type="submit"
          className="h-10 rounded-lg border border-black/[.08] px-4 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
        >
          Search
        </button>
      </form>

      <div className="overflow-hidden rounded-2xl border border-black/[.08] bg-white dark:border-white/[.145] dark:bg-[#0a0a0a]">
        <div
          className={`grid ${GRID_COLS} gap-4 border-b border-black/[.06] px-4 py-2 text-xs font-medium text-zinc-500 dark:border-white/[.08] dark:text-zinc-400`}
        >
          <SortableHeader label="Name" sortKey="name" basePath="/staff/accounts" searchParams={params} />
          <SortableHeader label="Warehouses" sortKey="warehouses" basePath="/staff/accounts" searchParams={params} />
          <SortableHeader label="Staff" sortKey="staff" basePath="/staff/accounts" searchParams={params} />
          <span>Warehouse Managers</span>
          <SortableHeader label="Status" sortKey="status" basePath="/staff/accounts" searchParams={params} />
          <span />
          <span />
        </div>

        {sorted.length === 0 ? (
          <p className="p-4 text-sm text-zinc-500 dark:text-zinc-500">No accounts found.</p>
        ) : (
          sorted.map((a) => {
            const boundAssign = assignWarehouseManager.bind(null, a.id);
            const boundToggleActive = toggleAccountActive.bind(null, a.id, a.active);
            const boundUpdateAccount = updateAccount.bind(null, a.id);
            return (
              <Fragment key={a.id}>
              <details className="group border-b border-black/[.06] last:border-b-0 dark:border-white/[.08]">
                <summary
                  className={`grid ${GRID_COLS} cursor-pointer list-none items-center gap-4 px-4 py-3 text-sm hover:bg-black/[.02] dark:hover:bg-white/[.03]`}
                >
                  <span className="font-medium text-black dark:text-zinc-50">{a.name}</span>
                  <span className="text-zinc-600 dark:text-zinc-400">{a._count.warehouses}</span>
                  <span className="text-zinc-600 dark:text-zinc-400">{a._count.staff}</span>
                  <span className="truncate text-zinc-600 dark:text-zinc-400">
                    {a.staff.length > 0 ? a.staff.map((s) => s.name).join(", ") : "—"}
                  </span>
                  <span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        a.active
                          ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
                          : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                      }`}
                    >
                      {a.active ? "Active" : "Inactive"}
                    </span>
                  </span>
                  <span className="flex items-center gap-1">
                    <button
                      type="button"
                      popoverTarget={`edit-account-${a.id}`}
                      title="Edit account"
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-black/[.08] transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <form action={boundToggleActive}>
                      <button
                        type="submit"
                        className="h-7 rounded-full border border-black/[.08] px-3 text-xs font-medium whitespace-nowrap transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
                      >
                        {a.active ? "Deactivate" : "Reactivate"}
                      </button>
                    </form>
                  </span>
                  <ChevronDown className="h-4 w-4 text-zinc-400 transition-transform group-open:rotate-180" />
                </summary>

                <div className="flex flex-col gap-3 border-t border-black/[.06] bg-zinc-50 p-4 dark:border-white/[.08] dark:bg-white/[.02]">
                  {a.staff.length > 0 && (
                    <div className="flex flex-col gap-2">
                      {a.staff.map((s) => {
                        const boundUpdate = updateWarehouseManager.bind(null, a.id, s.id);
                        const boundRemove = removeWarehouseManager.bind(null, a.id, s.id);
                        const additionalIds = new Set(s.warehouseAccess.map((wa) => wa.warehouseId));
                        return (
                          <div
                            key={s.id}
                            className="flex flex-col gap-2 rounded-xl border border-black/[.06] bg-white p-3 dark:border-white/[.08] dark:bg-[#0a0a0a]"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-xs text-zinc-600 dark:text-zinc-400">
                                {s.name} · {s.email}
                              </span>
                              <form action={boundRemove}>
                                <button
                                  type="submit"
                                  className="h-7 rounded-full border border-black/[.08] px-3 text-xs font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
                                >
                                  Remove
                                </button>
                              </form>
                            </div>
                            <form action={boundUpdate} className="flex flex-wrap items-end gap-2">
                              <div className="flex flex-col gap-1">
                                <label htmlFor={`mgr-warehouseId-${s.id}`} className="text-xs text-zinc-600 dark:text-zinc-400">
                                  Home Warehouse
                                </label>
                                <select
                                  id={`mgr-warehouseId-${s.id}`}
                                  name="warehouseId"
                                  defaultValue={s.warehouseId ?? undefined}
                                  className="h-9 rounded-lg border border-black/[.08] bg-white px-2 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
                                >
                                  {a.warehouses.map((w) => (
                                    <option key={w.id} value={w.id}>
                                      {w.name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="flex flex-col gap-1">
                                <label htmlFor={`mgr-additional-${s.id}`} className="text-xs text-zinc-600 dark:text-zinc-400">
                                  Additional Locations
                                </label>
                                <select
                                  id={`mgr-additional-${s.id}`}
                                  name="additionalWarehouseIds"
                                  multiple
                                  size={Math.min(4, a.warehouses.length || 1)}
                                  defaultValue={Array.from(additionalIds)}
                                  className="w-48 rounded-lg border border-black/[.08] bg-white px-2 py-1 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
                                >
                                  {a.warehouses.map((w) => (
                                    <option key={w.id} value={w.id}>
                                      {w.name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="flex flex-col gap-1">
                                <label htmlFor={`mgr-password-${s.id}`} className="text-xs text-zinc-600 dark:text-zinc-400">
                                  Reset Password (optional)
                                </label>
                                <input
                                  id={`mgr-password-${s.id}`}
                                  type="password"
                                  name="password"
                                  className="h-9 rounded-lg border border-black/[.08] bg-white px-2 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
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
                        );
                      })}
                    </div>
                  )}

                  {a.warehouses.length === 0 ? (
                    <p className="text-xs text-zinc-500 dark:text-zinc-500">
                      Add a warehouse for this account on the Warehouses page before assigning a manager.
                    </p>
                  ) : (
                    <form action={boundAssign} className="flex flex-wrap items-end gap-2">
                      <div className="flex flex-col gap-1">
                        <label htmlFor={`name-${a.id}`} className="text-xs text-zinc-600 dark:text-zinc-400">
                          Name
                        </label>
                        <input
                          id={`name-${a.id}`}
                          name="name"
                          type="text"
                          required
                          className="h-9 rounded-lg border border-black/[.08] bg-white px-2 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label htmlFor={`email-${a.id}`} className="text-xs text-zinc-600 dark:text-zinc-400">
                          Email
                        </label>
                        <input
                          id={`email-${a.id}`}
                          name="email"
                          type="email"
                          required
                          className="h-9 rounded-lg border border-black/[.08] bg-white px-2 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label htmlFor={`password-${a.id}`} className="text-xs text-zinc-600 dark:text-zinc-400">
                          Password
                        </label>
                        <input
                          id={`password-${a.id}`}
                          name="password"
                          type="password"
                          required
                          className="h-9 rounded-lg border border-black/[.08] bg-white px-2 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label htmlFor={`warehouseId-${a.id}`} className="text-xs text-zinc-600 dark:text-zinc-400">
                          Warehouse
                        </label>
                        <select
                          id={`warehouseId-${a.id}`}
                          name="warehouseId"
                          className="h-9 rounded-lg border border-black/[.08] bg-white px-2 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
                        >
                          {a.warehouses.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label htmlFor={`additionalWarehouseIds-${a.id}`} className="text-xs text-zinc-600 dark:text-zinc-400">
                          Additional Locations
                        </label>
                        <select
                          id={`additionalWarehouseIds-${a.id}`}
                          name="additionalWarehouseIds"
                          multiple
                          size={Math.min(4, a.warehouses.length || 1)}
                          className="w-48 rounded-lg border border-black/[.08] bg-white px-2 py-1 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
                        >
                          {a.warehouses.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <button
                        type="submit"
                        className="h-9 rounded-full border border-black/[.08] px-4 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
                      >
                        Assign Warehouse Manager
                      </button>
                    </form>
                  )}
                </div>
              </details>

              <div
                id={`edit-account-${a.id}`}
                popover="auto"
                className="w-full max-w-md rounded-2xl border border-black/[.08] bg-white shadow-xl dark:border-white/[.145] dark:bg-[#0a0a0a]"
              >
                <div className="flex items-start gap-3 border-b border-black/[.06] p-5 dark:border-white/[.08]">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                    <Pencil className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-black dark:text-zinc-50">Edit Account</h2>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Update this account&apos;s name</p>
                  </div>
                </div>
                <form action={boundUpdateAccount} className="flex flex-col gap-4 p-5">
                  <div className="flex flex-col gap-1">
                    <label htmlFor={`edit-name-${a.id}`} className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      Account Name
                    </label>
                    <input
                      id={`edit-name-${a.id}`}
                      name="name"
                      type="text"
                      required
                      defaultValue={a.name}
                      className="h-10 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
                    />
                  </div>
                  <div className="flex justify-end gap-2 border-t border-black/[.06] pt-4 dark:border-white/[.08]">
                    <button
                      type="button"
                      popoverTarget={`edit-account-${a.id}`}
                      popoverTargetAction="hide"
                      className="h-10 rounded-full border border-black/[.08] px-4 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="h-10 rounded-full bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
                    >
                      Save
                    </button>
                  </div>
                </form>
              </div>
              </Fragment>
            );
          })
        )}
      </div>
    </div>
  );
}
