import { StaffRole } from "@/app/generated/prisma/client";

export { StaffRole };

export interface StaffAccess {
  role: StaffRole;
  warehouseId: string;
  warehouseAccess: { warehouseId: string }[];
}

/** null = unrestricted (every warehouse); otherwise the exact set of accessible warehouse IDs. */
export function getWarehouseScope(staff: StaffAccess): string[] | null {
  if (staff.role === "ADMIN" || staff.role === "ANALYST") return null;
  if (staff.role === "FACILITY_MANAGER") {
    return Array.from(new Set([staff.warehouseId, ...staff.warehouseAccess.map((w) => w.warehouseId)]));
  }
  return [staff.warehouseId]; // DOCK_STAFF
}

export function canAccessWarehouse(staff: StaffAccess, warehouseId: string): boolean {
  const scope = getWarehouseScope(staff);
  return scope === null || scope.includes(warehouseId);
}

/** Drop-in replacement for `where: { warehouseId: staff.warehouseId }` that stays unscoped for ADMIN/ANALYST. */
export function warehouseWhereClause(staff: StaffAccess): { in: string[] } | undefined {
  const scope = getWarehouseScope(staff);
  return scope === null ? undefined : { in: scope };
}

export function canManageCapacityRules(role: StaffRole): boolean {
  return role === "ADMIN" || role === "FACILITY_MANAGER";
}

export function canApproveRequests(role: StaffRole): boolean {
  return role === "ADMIN" || role === "FACILITY_MANAGER";
}

export function canOperateSchedule(role: StaffRole): boolean {
  return role === "ADMIN" || role === "FACILITY_MANAGER" || role === "DOCK_STAFF";
}

export function canManageCarrierAccounts(role: StaffRole): boolean {
  return role === "ADMIN" || role === "FACILITY_MANAGER";
}

export function canResolveAppeals(role: StaffRole): boolean {
  return role === "ADMIN";
}

export function canManageStaff(role: StaffRole): boolean {
  return role === "ADMIN";
}

export function canManageTagDefinitions(role: StaffRole): boolean {
  return role === "ADMIN";
}

export function canCreateWarehouse(role: StaffRole): boolean {
  return role === "ADMIN";
}

/** Dock/Gate staff have no reporting or analytics access per their role definition. */
export function canViewReports(role: StaffRole): boolean {
  return role === "ADMIN" || role === "FACILITY_MANAGER" || role === "ANALYST";
}

export function landingPathForRole(role: StaffRole): string {
  switch (role) {
    case "ADMIN":
      return "/staff";
    case "FACILITY_MANAGER":
      return "/staff/docks";
    case "DOCK_STAFF":
      return "/staff/schedule";
    case "ANALYST":
      return "/staff/analytics";
  }
}
