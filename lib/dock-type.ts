import { DockType } from "@/app/generated/prisma/client";

export const DOCK_TYPE_LABELS: Record<DockType, string> = {
  FLUSH: "Flush Dock",
  ENCLOSED: "Enclosed Dock",
  DRIVE_IN: "Drive-in Dock",
  SAWTOOTH: "Sawtooth Dock",
  OPEN: "Open Dock",
};

export const DOCK_TYPE_VALUES = Object.keys(DOCK_TYPE_LABELS) as DockType[];

export function isDockType(value: unknown): value is DockType {
  return typeof value === "string" && value in DOCK_TYPE_LABELS;
}
