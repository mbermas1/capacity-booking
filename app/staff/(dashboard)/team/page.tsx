import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/portal-auth";
import { getStaffMember } from "@/lib/staff-session";
import { canManageStaff, StaffRole } from "@/lib/staff-roles";
import { Prisma } from "@/app/generated/prisma/client";

const ROLE_LABELS: Record<StaffRole, string> = {
  ADMIN: "Owner / Admin",
  FACILITY_MANAGER: "Facility / Ops Manager",
  DOCK_STAFF: "Dock / Gate Staff",
  ANALYST: "Analyst (read-only)",
};

function isStaffRole(value: string): value is StaffRole {
  return (Object.values(StaffRole) as string[]).includes(value);
}

async function assertNotLastAdmin(staffId: string, nextRole: StaffRole | null): Promise<boolean> {
  if (nextRole === "ADMIN") return true;
  const target = await prisma.staff.findUnique({ where: { id: staffId }, select: { role: true } });
  if (!target || target.role !== "ADMIN") return true;
  const adminCount = await prisma.staff.count({ where: { role: "ADMIN" } });
  return adminCount > 1;
}

async function createStaff(formData: FormData) {
  "use server";

  const staff = await getStaffMember();
  if (!staff || !canManageStaff(staff.role)) return;

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const roleRaw = String(formData.get("role") ?? "");
  const role = isStaffRole(roleRaw) ? roleRaw : "DOCK_STAFF";
  const warehouseId = String(formData.get("warehouseId") ?? "").trim();
  const additionalWarehouseIds = formData
    .getAll("additionalWarehouseIds")
    .map(String)
    .filter((id) => id !== warehouseId);

  if (!name || !email || !password || !warehouseId) {
    redirect("/staff/team?error=" + encodeURIComponent("Name, email, password, and home location are required."));
  }

  try {
    const created = await prisma.staff.create({
      data: { name, email, passwordHash: hashPassword(password), role, warehouseId },
    });
    if (role === "FACILITY_MANAGER" && additionalWarehouseIds.length > 0) {
      await prisma.staffWarehouse.createMany({
        data: additionalWarehouseIds.map((id) => ({ staffId: created.id, warehouseId: id })),
      });
    }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      redirect("/staff/team?error=" + encodeURIComponent("A staff account with this email already exists."));
    }
    throw error;
  }

  revalidatePath("/staff/team");
  redirect("/staff/team?message=" + encodeURIComponent("Account created."));
}

async function updateStaff(staffId: string, formData: FormData) {
  "use server";

  const staff = await getStaffMember();
  if (!staff || !canManageStaff(staff.role)) return;

  const roleRaw = String(formData.get("role") ?? "");
  const role = isStaffRole(roleRaw) ? roleRaw : null;
  const warehouseId = String(formData.get("warehouseId") ?? "").trim();
  const additionalWarehouseIds = formData
    .getAll("additionalWarehouseIds")
    .map(String)
    .filter((id) => id !== warehouseId);
  const newPassword = String(formData.get("password") ?? "").trim();

  if (!role || !warehouseId) return;
  if (!(await assertNotLastAdmin(staffId, role))) {
    redirect("/staff/team?error=" + encodeURIComponent("Can't change the role of the last remaining Admin."));
  }

  await prisma.$transaction(async (tx) => {
    await tx.staff.update({
      where: { id: staffId },
      data: {
        role,
        warehouseId,
        ...(newPassword ? { passwordHash: hashPassword(newPassword) } : {}),
      },
    });
    await tx.staffWarehouse.deleteMany({ where: { staffId } });
    if (role === "FACILITY_MANAGER" && additionalWarehouseIds.length > 0) {
      await tx.staffWarehouse.createMany({
        data: additionalWarehouseIds.map((id) => ({ staffId, warehouseId: id })),
      });
    }
  });

  revalidatePath("/staff/team");
  redirect("/staff/team?message=" + encodeURIComponent("Account updated."));
}

async function deleteStaff(staffId: string) {
  "use server";

  const staff = await getStaffMember();
  if (!staff || !canManageStaff(staff.role)) return;

  if (!(await assertNotLastAdmin(staffId, null))) {
    redirect("/staff/team?error=" + encodeURIComponent("Can't remove the last remaining Admin."));
  }

  await prisma.staff.delete({ where: { id: staffId } });

  revalidatePath("/staff/team");
  redirect("/staff/team?message=" + encodeURIComponent("Account removed."));
}

export default async function StaffTeamPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; error?: string }>;
}) {
  const staff = await getStaffMember();
  if (!staff) return null;
  if (!canManageStaff(staff.role)) {
    return <p className="text-sm text-zinc-600 dark:text-zinc-400">You don&apos;t have access to this page.</p>;
  }

  const { message, error } = await searchParams;

  const [members, warehouses] = await Promise.all([
    prisma.staff.findMany({
      orderBy: { name: "asc" },
      include: { warehouse: true, warehouseAccess: { include: { warehouse: true } } },
    }),
    prisma.warehouse.findMany({ orderBy: { name: "asc" } }),
  ]);

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
        <h1 className="mb-4 text-xl font-semibold text-black dark:text-zinc-50">Add a Staff Account</h1>
        <form
          action={createStaff}
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
            <label htmlFor="email" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="h-10 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="password" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              className="h-10 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="role" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Role
            </label>
            <select
              id="role"
              name="role"
              defaultValue="DOCK_STAFF"
              className="h-10 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            >
              {Object.values(StaffRole).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="warehouseId" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Home Location
            </label>
            <select
              id="warehouseId"
              name="warehouseId"
              className="h-10 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="additionalWarehouseIds" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Additional Locations
            </label>
            <select
              id="additionalWarehouseIds"
              name="additionalWarehouseIds"
              multiple
              size={Math.min(4, warehouses.length || 1)}
              className="w-48 rounded-lg border border-black/[.08] bg-white px-3 py-1 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <span className="text-xs text-zinc-500 dark:text-zinc-500">Facility/Ops Manager role only</span>
          </div>
          <button
            type="submit"
            className="h-10 rounded-full bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            Create Account
          </button>
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium text-black dark:text-zinc-50">Staff Accounts</h2>
        {members.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-500">No staff accounts yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {members.map((m) => {
              const boundUpdate = updateStaff.bind(null, m.id);
              const boundDelete = deleteStaff.bind(null, m.id);
              const additionalIds = new Set(m.warehouseAccess.map((wa) => wa.warehouseId));
              return (
                <li
                  key={m.id}
                  className="flex flex-col gap-3 rounded-2xl border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-[#0a0a0a]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium text-black dark:text-zinc-50">{m.name}</span>
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        {m.email} · {ROLE_LABELS[m.role]} · home: {m.warehouse.name}
                        {m.warehouseAccess.length > 0 &&
                          ` + ${m.warehouseAccess.map((wa) => wa.warehouse.name).join(", ")}`}
                      </span>
                    </div>
                    <form action={boundDelete}>
                      <button
                        type="submit"
                        className="h-8 rounded-full border border-black/[.08] px-3 text-xs font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
                      >
                        Remove
                      </button>
                    </form>
                  </div>
                  <form action={boundUpdate} className="flex flex-wrap items-end gap-2">
                    <div className="flex flex-col gap-1">
                      <label htmlFor={`role-${m.id}`} className="text-xs text-zinc-600 dark:text-zinc-400">
                        Role
                      </label>
                      <select
                        id={`role-${m.id}`}
                        name="role"
                        defaultValue={m.role}
                        className="h-9 rounded-lg border border-black/[.08] bg-white px-2 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
                      >
                        {Object.values(StaffRole).map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label htmlFor={`warehouseId-${m.id}`} className="text-xs text-zinc-600 dark:text-zinc-400">
                        Home Location
                      </label>
                      <select
                        id={`warehouseId-${m.id}`}
                        name="warehouseId"
                        defaultValue={m.warehouseId}
                        className="h-9 rounded-lg border border-black/[.08] bg-white px-2 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
                      >
                        {warehouses.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label htmlFor={`additionalWarehouseIds-${m.id}`} className="text-xs text-zinc-600 dark:text-zinc-400">
                        Additional Locations
                      </label>
                      <select
                        id={`additionalWarehouseIds-${m.id}`}
                        name="additionalWarehouseIds"
                        multiple
                        size={Math.min(4, warehouses.length || 1)}
                        defaultValue={Array.from(additionalIds)}
                        className="w-48 rounded-lg border border-black/[.08] bg-white px-2 py-1 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
                      >
                        {warehouses.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label htmlFor={`password-${m.id}`} className="text-xs text-zinc-600 dark:text-zinc-400">
                        Reset Password (optional)
                      </label>
                      <input
                        id={`password-${m.id}`}
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
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
