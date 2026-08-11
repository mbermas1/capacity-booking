import { StaffRole } from "@/app/generated/prisma/client";

export { StaffRole };

export interface StaffAccess {
  role: StaffRole;
  accountId: string | null; // null only for SUPER_USER
  warehouseId: string | null; // null only for SUPER_USER
  /**
   * Additional accessible warehouses beyond the home one. For WAREHOUSE_MANAGER/DOCK_MANAGER
   * these are real StaffWarehouse grants; for ANALYST, getStaffMember() populates this with
   * every other warehouse in the account (their scope is "whole account", not hand-granted).
   */
  warehouseAccess: { warehouseId: string }[];
}

/**
 * null = unrestricted (every warehouse, every account); otherwise the exact set of
 * accessible warehouse IDs, always within the staff member's own account.
 */
export function getWarehouseScope(staff: StaffAccess): string[] | null {
  if (staff.role === "SUPER_USER") return null;
  if (staff.role === "DOCK_STAFF") return [staff.warehouseId!];
  return Array.from(new Set([staff.warehouseId!, ...staff.warehouseAccess.map((w) => w.warehouseId)]));
}

export function canAccessWarehouse(staff: StaffAccess, warehouseId: string): boolean {
  const scope = getWarehouseScope(staff);
  return scope === null || scope.includes(warehouseId);
}

/** Drop-in replacement for `where: { warehouseId: staff.warehouseId }` that stays unscoped for SUPER_USER. */
export function warehouseWhereClause(staff: StaffAccess): { in: string[] } | undefined {
  const scope = getWarehouseScope(staff);
  return scope === null ? undefined : { in: scope };
}

/** null = unrestricted (every Account); otherwise the single Account the staff member belongs to. */
export function getAccountScope(staff: StaffAccess): string[] | null {
  return staff.role === "SUPER_USER" ? null : [staff.accountId!];
}

/** Drop-in replacement for `where: { accountId: staff.accountId }` that stays unscoped for SUPER_USER. */
export function accountWhereClause(staff: StaffAccess): { in: string[] } | undefined {
  const scope = getAccountScope(staff);
  return scope === null ? undefined : { in: scope };
}

export function canManageCapacityRules(role: StaffRole): boolean {
  return role === "WAREHOUSE_MANAGER" || role === "DOCK_MANAGER";
}

export function canApproveRequests(role: StaffRole): boolean {
  return role === "WAREHOUSE_MANAGER" || role === "DOCK_MANAGER";
}

export function canOperateSchedule(role: StaffRole): boolean {
  return role === "WAREHOUSE_MANAGER" || role === "DOCK_MANAGER" || role === "DOCK_STAFF";
}

export function canManageCarrierAccounts(role: StaffRole): boolean {
  return role === "WAREHOUSE_MANAGER" || role === "DOCK_MANAGER";
}

export function canResolveAppeals(role: StaffRole): boolean {
  return role === "WAREHOUSE_MANAGER";
}

/**
 * Team page access: manage the DOCK_MANAGER/DOCK_STAFF/ANALYST staff within your own
 * account. WAREHOUSE_MANAGER assignment itself is SUPER_USER-only, done from the
 * Accounts page (canAssignWarehouseManager below) — not here.
 */
export function canManageStaff(role: StaffRole): boolean {
  return role === "WAREHOUSE_MANAGER";
}

/** Only a SUPER_USER assigns/creates WAREHOUSE_MANAGERs — done from the Accounts page. */
export function canAssignWarehouseManager(role: StaffRole): boolean {
  return role === "SUPER_USER";
}

export function canManageTagDefinitions(role: StaffRole): boolean {
  return role === "WAREHOUSE_MANAGER";
}

/** The "Set up your Warehouse" walkthrough is only meaningful for the role that owns warehouse setup. */
export function canViewSetupGuide(role: StaffRole): boolean {
  return role === "WAREHOUSE_MANAGER";
}

/** Only a SUPER_USER provisions new tenants and their warehouses. */
export function canCreateAccount(role: StaffRole): boolean {
  return role === "SUPER_USER";
}

export function canCreateWarehouse(role: StaffRole): boolean {
  return role === "SUPER_USER";
}

/** Dock/Gate staff have no reporting or analytics access per their role definition. */
export function canViewReports(role: StaffRole): boolean {
  return role === "WAREHOUSE_MANAGER" || role === "DOCK_MANAGER" || role === "ANALYST";
}

export function landingPathForRole(role: StaffRole): string {
  switch (role) {
    case "SUPER_USER":
      return "/staff/accounts";
    case "WAREHOUSE_MANAGER":
      return "/staff";
    case "DOCK_MANAGER":
      return "/staff/docks";
    case "DOCK_STAFF":
      return "/staff/schedule";
    case "ANALYST":
      return "/staff/analytics";
  }
}
