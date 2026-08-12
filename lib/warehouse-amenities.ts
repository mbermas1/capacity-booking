export const AMENITY_LABELS: Record<string, string> = {
  lumper_services: "Lumper services",
  drivers_restroom: "Drivers restroom",
  overnight_parking: "Overnight parking",
  free_wifi: "Free Wi-Fi",
};

export const PPE_LABELS: Record<string, string> = {
  face_mask: "Face Mask",
  safety_glasses: "Safety Glasses",
  hard_hat: "Hard Hat",
  safety_boots: "Safety Boots",
  gloves: "Gloves",
  high_visibility_vest: "High Visibility Vest",
  long_pants: "Long Pants",
  long_sleeves: "Long Sleeves",
  no_smoking: "No Smoking",
};

export function parseChecklist(value: string, labels: Record<string, string>): string[] {
  return value
    .split(",")
    .map((slug) => slug.trim())
    .filter((slug) => slug in labels);
}

export function serializeChecklist(slugs: string[], labels: Record<string, string>): string {
  return slugs.filter((slug) => slug in labels).join(",");
}
