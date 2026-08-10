import { PartnerType } from "@/app/generated/prisma/client";

export const PARTNER_TYPE_LABELS: Record<PartnerType, string> = {
  CARRIER: "Carrier",
  SUPPLIER: "Supplier",
  THIRD_PARTY_LOGISTICS: "3PL",
};
