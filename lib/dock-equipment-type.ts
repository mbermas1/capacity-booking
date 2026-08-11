import { DockEquipmentType } from "@/app/generated/prisma/client";

export const DOCK_EQUIPMENT_TYPE_LABELS: Record<DockEquipmentType, string> = {
  FLUSH: "Flush Dock",
  ENCLOSED: "Enclosed Dock",
  DRIVE_IN: "Drive-in Dock",
  SAWTOOTH: "Sawtooth Dock",
  OPEN: "Open Dock",
};

export function isDockEquipmentType(value: unknown): value is DockEquipmentType {
  return typeof value === "string" && value in DOCK_EQUIPMENT_TYPE_LABELS;
}
