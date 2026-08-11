import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  Building2,
  Calendar,
  DoorOpen,
  FileText,
  Gauge,
  Inbox,
  LogOut,
  Scale,
  Tag,
  Truck,
  Users,
  Warehouse,
  BarChart3,
  type LucideIcon,
} from "lucide-react";
import { getStaffMember, requireStaffSession, STAFF_SESSION_COOKIE } from "@/lib/staff-session";
import { SidebarShell } from "./sidebar-shell";
import {
  canApproveRequests,
  canCreateAccount,
  canCreateWarehouse,
  canManageCapacityRules,
  canManageStaff,
  canManageTagDefinitions,
  canOperateSchedule,
  canResolveAppeals,
  canViewReports,
  StaffRole,
} from "@/lib/staff-roles";

async function logout() {
  "use server";
  const store = await cookies();
  store.delete(STAFF_SESSION_COOKIE);
  redirect("/staff/login");
}

type NavItem = { label: string; href: string; icon: LucideIcon; visible: boolean };
type NavSection = { label: string; items: NavItem[] };

function buildSections(role: StaffRole): NavSection[] {
  return [
    {
      label: "Operations",
      items: [
        { label: "Schedule", href: "/staff/schedule", icon: Calendar, visible: canOperateSchedule(role) },
        { label: "Requests", href: "/staff/requests", icon: Inbox, visible: canApproveRequests(role) },
        { label: "Docks", href: "/staff/docks", icon: DoorOpen, visible: canManageCapacityRules(role) },
        { label: "Capacity", href: "/staff/capacity", icon: Gauge, visible: canManageCapacityRules(role) },
      ],
    },
    {
      label: "Directory",
      items: [
        { label: "Carriers", href: "/staff", icon: Truck, visible: role !== "DOCK_STAFF" },
        { label: "Team", href: "/staff/team", icon: Users, visible: canManageStaff(role) },
      ],
    },
    {
      label: "Insights",
      items: [
        { label: "Analytics", href: "/staff/analytics", icon: BarChart3, visible: canViewReports(role) },
        { label: "Reports", href: "/staff/reports", icon: FileText, visible: canViewReports(role) },
        { label: "Appeals", href: "/staff/appeals", icon: Scale, visible: canResolveAppeals(role) },
      ],
    },
    {
      label: "Configuration",
      items: [
        { label: "Accounts", href: "/staff/accounts", icon: Building2, visible: canCreateAccount(role) },
        { label: "Warehouses", href: "/staff/warehouses", icon: Warehouse, visible: canCreateWarehouse(role) },
        { label: "Tags", href: "/staff/tags", icon: Tag, visible: canManageTagDefinitions(role) },
      ],
    },
  ];
}

export default async function StaffDashboardLayout({ children }: { children: React.ReactNode }) {
  await requireStaffSession();
  const staff = await getStaffMember();
  const sections = staff ? buildSections(staff.role) : [];

  return (
    <div className="flex min-h-full flex-1 bg-zinc-50 font-sans dark:bg-black">
      <SidebarShell>
        <div className="sidebar-header flex flex-col gap-3">
          <Image src="/logo.png" alt="CapacityBooking" width={159} height={40} className="logo-full h-8 w-auto" priority />
          <Image src="/logo-mark.png" alt="CapacityBooking" width={32} height={32} className="logo-mark h-8 w-8" priority />
          <div className="sidebar-label flex flex-col">
            <span className="text-sm font-semibold text-black dark:text-zinc-50">
              {staff?.warehouse ? staff.warehouse.name : "All Accounts"}
            </span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {staff?.warehouse ? staff.warehouse.location : "Super User"}
            </span>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-2">
          {sections.map((section) => {
            const visibleItems = section.items.filter((item) => item.visible);
            if (visibleItems.length === 0) return null;
            return (
              <div key={section.label} className="flex flex-col gap-1">
                <span className="sidebar-label px-3 text-xs font-medium tracking-wide text-zinc-400 uppercase dark:text-zinc-500">
                  {section.label}
                </span>
                {visibleItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={item.label}
                    className="nav-link flex items-center gap-3 rounded-full px-3 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-black/[.04] hover:text-black dark:text-zinc-400 dark:hover:bg-white/[.06] dark:hover:text-zinc-50"
                  >
                    <item.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
                    <span className="sidebar-label">{item.label}</span>
                  </Link>
                ))}
              </div>
            );
          })}
        </nav>

        <div className="flex flex-col gap-3 border-t border-black/[.08] px-5 py-4 dark:border-white/[.145]">
          <span className="sidebar-label text-sm text-zinc-600 dark:text-zinc-400">{staff?.name}</span>
          <form action={logout}>
            <button
              type="submit"
              title="Log out"
              className="flex h-8 w-full items-center justify-center gap-2 rounded-full border border-black/[.08] px-3 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              <span className="sidebar-label">Log out</span>
            </button>
          </form>
        </div>
      </SidebarShell>

      <main className="min-w-0 flex-1 px-8 py-10">
        <div className="mx-auto w-full max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
