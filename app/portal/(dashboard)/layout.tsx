import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CalendarPlus, LayoutDashboard, Users, type LucideIcon } from "lucide-react";
import { getPortalUser, requirePortalSession, PORTAL_SESSION_COOKIE } from "@/lib/portal-session";
import { canManageCarrierUsers } from "@/lib/portal-roles";
import { PARTNER_TYPE_LABELS } from "@/lib/partner-type";

async function logout() {
  "use server";
  const store = await cookies();
  store.delete(PORTAL_SESSION_COOKIE);
  redirect("/portal/login");
}

type NavItem = { label: string; href: string; icon: LucideIcon; visible: boolean };

export default async function PortalDashboardLayout({ children }: { children: React.ReactNode }) {
  await requirePortalSession();
  const user = await getPortalUser();
  const carrier = user?.carrier ?? null;
  const portalTitle = carrier ? `${PARTNER_TYPE_LABELS[carrier.partnerType]} Portal` : "Carrier Portal";

  const items: NavItem[] = [
    { label: "Dashboard", href: "/portal", icon: LayoutDashboard, visible: true },
    { label: "Book a Slot", href: "/portal/book", icon: CalendarPlus, visible: true },
    { label: "Team", href: "/portal/team", icon: Users, visible: !!user && canManageCarrierUsers(user.role) },
  ];

  return (
    <div className="flex min-h-full flex-1 bg-zinc-50 font-sans dark:bg-black">
      <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-black/[.08] bg-white dark:border-white/[.145] dark:bg-[#0a0a0a]">
        <div className="flex flex-col items-start gap-3 px-5 py-5">
          <Image src="/logo.png" alt="CapacityBooking" width={159} height={40} className="h-8 w-auto" priority />
          <span className="text-sm font-semibold text-black dark:text-zinc-50">{portalTitle}</span>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-2">
          {items
            .filter((item) => item.visible)
            .map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 rounded-full px-3 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-black/[.04] hover:text-black dark:text-zinc-400 dark:hover:bg-white/[.06] dark:hover:text-zinc-50"
              >
                <item.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
                {item.label}
              </Link>
            ))}
        </nav>

        <div className="flex flex-col gap-3 border-t border-black/[.08] px-5 py-4 dark:border-white/[.145]">
          <div className="flex flex-col">
            <span className="text-sm text-zinc-600 dark:text-zinc-400">{user?.name}</span>
            <span className="text-xs text-zinc-500 dark:text-zinc-500">{carrier?.name}</span>
          </div>
          <form action={logout}>
            <button
              type="submit"
              className="h-8 w-full rounded-full border border-black/[.08] px-3 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
            >
              Log out
            </button>
          </form>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-8 py-10">
        <div className="mx-auto w-full max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
