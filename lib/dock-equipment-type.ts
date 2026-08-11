import { DockEquipmentType } from "@/app/generated/prisma/client";

export const DOCK_EQUIPMENT_TYPE_LABELS: Record<DockEquipmentType, string> = {
  STANDARD: "Standard Dock Door",
  GROUND_LEVEL: "Ground-level Dock Door",
};

export function isDockEquipmentType(value: unknown): value is DockEquipmentType {
  return typeof value === "string" && value in DOCK_EQUIPMENT_TYPE_LABELS;
}
