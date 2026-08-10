import { CarrierUserRole } from "@/app/generated/prisma/client";

export { CarrierUserRole };

export function canManageCarrierUsers(role: CarrierUserRole): boolean {
  return role === "ADMIN";
}
