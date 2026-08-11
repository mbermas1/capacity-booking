import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/portal-auth";
import { getStaffMember } from "@/lib/staff-session";
import { canAssignWarehouseManager, canCreateAccount } from "@/lib/staff-roles";
import { Prisma } from "@/app/generated/prisma/client";

async function createAccount(formData: FormData) {
  "use server";

  const staff = await getStaffMember();
  if (!staff || !canCreateAccount(staff.role)) return;

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  await prisma.account.create({ data: { name } });

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

export default async function StaffAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; error?: string }>;
}) {
  const staff = await getStaffMember();
  if (!staff) return null;
  if (!canCreateAccount(staff.role)) {
    return <p className="text-sm text-zinc-600 dark:text-zinc-400">You don&apos;t have access to this page.</p>;
  }

  const { message, error } = await searchParams;

  const accounts = await prisma.account.findMany({
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

  return (
    <div className="flex flex-col gap-8">
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

      <section>
        <h1 className="mb-4 text-xl font-semibold text-black dark:text-zinc-50">Add an Account</h1>
        <form
          action={createAccount}
          className="flex flex-col gap-4 rounded-2xl border border-black/[.08] bg-white p-5 dark:border-white/[.145] dark:bg-[#0a0a0a] sm:flex-row sm:flex-wrap sm:items-end"
        >
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
          <button
            type="submit"
            className="h-10 rounded-full bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            Add Account
          </button>
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium text-black dark:text-zinc-50">Accounts</h2>
        {accounts.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-500">No accounts yet.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {accounts.map((a) => {
              const boundAssign = assignWarehouseManager.bind(null, a.id);
              return (
                <li
                  key={a.id}
                  className="flex flex-col gap-3 rounded-2xl border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-[#0a0a0a]"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-black dark:text-zinc-50">{a.name}</span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      {a._count.warehouses} warehouse{a._count.warehouses === 1 ? "" : "s"} · {a._count.staff} staff
                    </span>
                  </div>

                  {a.staff.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Warehouse Managers</span>
                      {a.staff.map((s) => {
                        const boundUpdate = updateWarehouseManager.bind(null, a.id, s.id);
                        const boundRemove = removeWarehouseManager.bind(null, a.id, s.id);
                        const additionalIds = new Set(s.warehouseAccess.map((wa) => wa.warehouseId));
                        return (
                          <div
                            key={s.id}
                            className="flex flex-col gap-2 rounded-xl border border-black/[.06] p-3 dark:border-white/[.08]"
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
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
