import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getStaffMember, requireStaffSession, STAFF_SESSION_COOKIE } from "@/lib/staff-session";

async function logout() {
  "use server";
  const store = await cookies();
  store.delete(STAFF_SESSION_COOKIE);
  redirect("/staff/login");
}

export default async function StaffDashboardLayout({ children }: { children: React.ReactNode }) {
  await requireStaffSession();
  const staff = await getStaffMember();

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 font-sans dark:bg-black">
      <header className="border-b border-black/[.08] bg-white dark:border-white/[.145] dark:bg-[#0a0a0a]">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-6 py-4 sm:px-10">
          <Link href="/staff" className="text-lg font-semibold text-black dark:text-zinc-50">
            Staff — Carrier Accounts
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-sm text-zinc-600 dark:text-zinc-400">{staff?.name}</span>
            <form action={logout}>
              <button
                type="submit"
                className="h-8 rounded-full border border-black/[.08] px-3 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
              >
                Log out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10 sm:px-10">{children}</main>
    </div>
  );
}
