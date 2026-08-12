import { DoorOpen, Clock, Tag, Tags, Gauge, DollarSign, Truck, Users, type LucideIcon } from "lucide-react";
import { prisma } from "@/lib/prisma";

export type SetupStep = {
  key: string;
  label: string;
  description: string;
  whatYoullDo: string[];
  required: boolean;
  complete: boolean;
  href: string;
  ctaLabel: string;
  icon: LucideIcon;
};

/**
 * Single source of truth for "is this warehouse set up" — every step is derived
 * from real data, not a separately-tracked flag, so it can never drift out of
 * sync with what's actually configured. Reused by the /staff banner and the
 * full /staff/setup page (same "compute once, render twice" shape as
 * lib/capacity-utilization.ts's computeWarehouseLoad).
 */
export async function computeSetupProgress(
  warehouseId: string,
  accountId: string,
): Promise<{ steps: SetupStep[]; completed: number; total: number }> {
  const [warehouse, account, warehouseStaffCount] = await Promise.all([
    prisma.warehouse.findUnique({
      where: { id: warehouseId },
      include: {
        docks: { include: { operatingHours: { take: 1 }, tags: { take: 1 } } },
        laborShifts: { take: 1 },
        yardCapacity: true,
      },
    }),
    prisma.account.findUnique({
      where: { id: accountId },
      include: {
        tags: { take: 1 },
        carriers: { take: 1 },
      },
    }),
    // scoped to staff who actually work this warehouse (home or granted access), not the whole
    // account — an account with several independently-managed warehouses shouldn't count one
    // warehouse's manager as a "team member" of another
    prisma.staff.count({
      where: { OR: [{ warehouseId }, { warehouseAccess: { some: { warehouseId } } }] },
    }),
  ]);

  const docks = warehouse?.docks ?? [];
  const hasDocks = docks.length > 0;
  const hasHours = docks.some((d) => d.operatingHours.length > 0);
  const hasAccountTags = (account?.tags.length ?? 0) > 0;
  const hasDockTags = docks.some((d) => d.tags.length > 0);
  const hasCapacity = (warehouse?.laborShifts.length ?? 0) > 0 || warehouse?.yardCapacity != null;
  const hasDetentionRate = warehouse?.detentionRatePerHour != null;
  const hasCarriers = (account?.carriers.length ?? 0) > 0;
  const hasTeam = warehouseStaffCount > 1;

  const steps: SetupStep[] = [
    {
      key: "docks",
      label: "Add a Dock",
      description: "Every booking needs a dock — this is the one required step before the warehouse can accept any bookings at all.",
      whatYoullDo: ["Set a name, location, and dock type", "Set how many simultaneous bookings it can hold", "Optionally set lead time, buffer time, or high-priority slot reservations"],
      required: true,
      complete: hasDocks,
      href: "/staff/docks",
      ctaLabel: "Go to Docks",
      icon: DoorOpen,
    },
    {
      key: "hours",
      label: "Set Dock Operating Hours",
      description: "Without hours configured, a dock is treated as open 24/7 — set this if that's not actually true.",
      whatYoullDo: ["Pick which days each dock is open", "Set specific open/close times, or mark a day fully closed"],
      required: false,
      complete: hasHours,
      href: "/staff/docks",
      ctaLabel: "Go to Docks",
      icon: Clock,
    },
    {
      key: "tags",
      label: "Define Tags",
      description: "Tags describe equipment types, commodities, and carrier requirements — only needed if you want matching rules enforced.",
      whatYoullDo: ["Create Equipment tags (e.g. reefer, dry van)", "Create Commodity tags, optionally with a minimum booking duration", "Create Carrier Requirement tags (e.g. hazmat-certified)"],
      required: false,
      complete: hasAccountTags,
      href: "/staff/tags",
      ctaLabel: "Go to Tags",
      icon: Tag,
    },
    {
      key: "dock-tags",
      label: "Assign Tags to Docks",
      description: "Once tags exist, attach them to the docks they actually apply to.",
      whatYoullDo: ["Pick which equipment each dock offers", "Pick which commodities each dock accepts", "Pick which carrier requirements each dock demands"],
      required: false,
      complete: hasDockTags,
      href: "/staff/docks",
      ctaLabel: "Go to Docks",
      icon: Tags,
    },
    {
      key: "capacity",
      label: "Configure Labor & Yard Capacity",
      description: "Optional warehouse-wide hard limits — a trailer-slot cap for the yard and/or scheduled labor headcount by day and time.",
      whatYoullDo: ["Set weekly labor shifts with a headcount", "Set a trailer-slot limit for the yard"],
      required: false,
      complete: hasCapacity,
      href: "/staff/capacity",
      ctaLabel: "Go to Capacity",
      icon: Gauge,
    },
    {
      key: "detention",
      label: "Set a Detention Rate",
      description: "Powers cost estimates on the Dwell report — doesn't affect booking availability either way.",
      whatYoullDo: ["Set a $/hour rate charged after a grace period", "Set how many minutes of free time are allowed first"],
      required: false,
      complete: hasDetentionRate,
      href: "/staff/reports/dwell",
      ctaLabel: "Go to Reports",
      icon: DollarSign,
    },
    {
      key: "carriers",
      label: "Pre-register Carriers",
      description: "Carriers get created automatically the first time they book or submit a request — do this ahead of time if you want to pre-clear specific carriers against requirement tags.",
      whatYoullDo: ["Add a carrier's company name and contact", "Assign any carrier-requirement tags they're cleared for"],
      required: false,
      complete: hasCarriers,
      href: "/staff",
      ctaLabel: "Go to Carriers",
      icon: Truck,
    },
    {
      key: "team",
      label: "Add Team Members",
      description: "Bring on Dock Managers, Dock/Gate Staff, or Analysts to help run the warehouse day to day.",
      whatYoullDo: ["Invite staff by name, email, and role", "Assign their home location (and additional locations, if needed)"],
      required: false,
      complete: hasTeam,
      href: "/staff/team",
      ctaLabel: "Go to Team",
      icon: Users,
    },
  ];

  return { steps, completed: steps.filter((s) => s.complete).length, total: steps.length };
}
