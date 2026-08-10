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
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 px-6 py-4 sm:px-10">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-lg font-semibold text-black dark:text-zinc-50">{staff?.warehouse.name}</span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">{staff?.warehouse.location}</span>
            </div>
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
          <nav className="flex items-center gap-4 text-sm font-medium text-zinc-600 dark:text-zinc-400">
            <Link href="/staff" className="hover:text-black dark:hover:text-zinc-50">
              Carriers
            </Link>
            <Link href="/staff/docks" className="hover:text-black dark:hover:text-zinc-50">
              Docks
            </Link>
            <Link href="/staff/schedule" className="hover:text-black dark:hover:text-zinc-50">
              Schedule
            </Link>
            <Link href="/staff/tags" className="hover:text-black dark:hover:text-zinc-50">
              Tags
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10 sm:px-10">{children}</main>
    </div>
  );
}
