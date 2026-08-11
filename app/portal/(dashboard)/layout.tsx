import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getPortalUser, requirePortalSession, PORTAL_SESSION_COOKIE } from "@/lib/portal-session";
import { canManageCarrierUsers } from "@/lib/portal-roles";
import { PARTNER_TYPE_LABELS } from "@/lib/partner-type";

async function logout() {
  "use server";
  const store = await cookies();
  store.delete(PORTAL_SESSION_COOKIE);
  redirect("/portal/login");
}

export default async function PortalDashboardLayout({ children }: { children: React.ReactNode }) {
  await requirePortalSession();
  const user = await getPortalUser();
  const carrier = user?.carrier ?? null;
  const portalTitle = carrier ? `${PARTNER_TYPE_LABELS[carrier.partnerType]} Portal` : "Carrier Portal";

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 font-sans dark:bg-black">
      <header className="border-b border-black/[.08] bg-white dark:border-white/[.145] dark:bg-[#0a0a0a]">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-6 py-4 sm:px-10">
          <div className="flex items-center gap-6">
            <Link href="/portal" className="flex items-center gap-3">
              <Image src="/logo.png" alt="CapacityBooking" width={159} height={40} className="h-8 w-auto" priority />
              <span className="text-lg font-semibold text-black dark:text-zinc-50">{portalTitle}</span>
            </Link>
            <Link
              href="/portal/book"
              className="text-sm font-medium text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
            >
              Book a Slot
            </Link>
            {user && canManageCarrierUsers(user.role) && (
              <Link
                href="/portal/team"
                className="text-sm font-medium text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
              >
                Team
              </Link>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-end">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">{user?.name}</span>
              <span className="text-xs text-zinc-500 dark:text-zinc-500">{carrier?.name}</span>
            </div>
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
