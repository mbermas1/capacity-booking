import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/portal-auth";
import { getPortalUser } from "@/lib/portal-session";
import { canManageCarrierUsers, CarrierUserRole } from "@/lib/portal-roles";
import { Prisma } from "@/app/generated/prisma/client";

const ROLE_LABELS: Record<CarrierUserRole, string> = {
  ADMIN: "Admin",
  MEMBER: "Member",
};

function isCarrierUserRole(value: string): value is CarrierUserRole {
  return (Object.values(CarrierUserRole) as string[]).includes(value);
}

async function assertNotLastAdmin(carrierId: string, userId: string, nextRole: CarrierUserRole | null): Promise<boolean> {
  if (nextRole === "ADMIN") return true;
  const target = await prisma.carrierUser.findUnique({ where: { id: userId }, select: { role: true, carrierId: true } });
  if (!target || target.carrierId !== carrierId || target.role !== "ADMIN") return true;
  const adminCount = await prisma.carrierUser.count({ where: { carrierId, role: "ADMIN" } });
  return adminCount > 1;
}

async function createUser(formData: FormData) {
  "use server";

  const me = await getPortalUser();
  if (!me || !canManageCarrierUsers(me.role)) return;

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const roleRaw = String(formData.get("role") ?? "");
  const role = isCarrierUserRole(roleRaw) ? roleRaw : "MEMBER";

  if (!name || !email || !password) {
    redirect("/portal/team?error=" + encodeURIComponent("Name, email, and password are required."));
  }

  try {
    await prisma.carrierUser.create({
      data: { carrierId: me.carrierId, name, email, passwordHash: hashPassword(password), role },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      redirect("/portal/team?error=" + encodeURIComponent("An account with this email already exists."));
    }
    throw error;
  }

  revalidatePath("/portal/team");
  redirect("/portal/team?message=" + encodeURIComponent("Teammate added."));
}

async function updateUser(userId: string, formData: FormData) {
  "use server";

  const me = await getPortalUser();
  if (!me || !canManageCarrierUsers(me.role)) return;

  const target = await prisma.carrierUser.findUnique({ where: { id: userId }, select: { carrierId: true } });
  if (!target || target.carrierId !== me.carrierId) return;

  const roleRaw = String(formData.get("role") ?? "");
  const role = isCarrierUserRole(roleRaw) ? roleRaw : null;
  const newPassword = String(formData.get("password") ?? "").trim();

  if (!role) return;
  if (!(await assertNotLastAdmin(me.carrierId, userId, role))) {
    redirect("/portal/team?error=" + encodeURIComponent("Can't change the role of the last remaining Admin."));
  }

  await prisma.carrierUser.update({
    where: { id: userId },
    data: { role, ...(newPassword ? { passwordHash: hashPassword(newPassword) } : {}) },
  });

  revalidatePath("/portal/team");
  redirect("/portal/team?message=" + encodeURIComponent("Teammate updated."));
}

async function removeUser(userId: string) {
  "use server";

  const me = await getPortalUser();
  if (!me || !canManageCarrierUsers(me.role)) return;

  const target = await prisma.carrierUser.findUnique({ where: { id: userId }, select: { carrierId: true } });
  if (!target || target.carrierId !== me.carrierId) return;

  if (!(await assertNotLastAdmin(me.carrierId, userId, null))) {
    redirect("/portal/team?error=" + encodeURIComponent("Can't remove the last remaining Admin."));
  }

  await prisma.carrierUser.delete({ where: { id: userId } });

  revalidatePath("/portal/team");
  redirect("/portal/team?message=" + encodeURIComponent("Teammate removed."));
}

export default async function PortalTeamPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; error?: string }>;
}) {
  const me = await getPortalUser();
  if (!me) return null;
  if (!canManageCarrierUsers(me.role)) {
    return <p className="text-sm text-zinc-600 dark:text-zinc-400">You don&apos;t have access to this page.</p>;
  }

  const { message, error } = await searchParams;

  const members = await prisma.carrierUser.findMany({
    where: { carrierId: me.carrierId },
    orderBy: { name: "asc" },
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
        <h1 className="mb-4 text-xl font-semibold text-black dark:text-zinc-50">Add a Teammate</h1>
        <form
          action={createUser}
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
              defaultValue="MEMBER"
              className="h-10 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            >
              {Object.values(CarrierUserRole).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="h-10 rounded-full bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            Add Teammate
          </button>
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium text-black dark:text-zinc-50">Team</h2>
        {members.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-500">No teammates yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {members.map((m) => {
              const boundUpdate = updateUser.bind(null, m.id);
              const boundRemove = removeUser.bind(null, m.id);
              return (
                <li
                  key={m.id}
                  className="flex flex-col gap-3 rounded-2xl border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-[#0a0a0a]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium text-black dark:text-zinc-50">{m.name}</span>
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        {m.email} · {ROLE_LABELS[m.role]}
                      </span>
                    </div>
                    <form action={boundRemove}>
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
                        {Object.values(CarrierUserRole).map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
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
