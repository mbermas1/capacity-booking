type OperatingHoursRule = {
  dayOfWeek: number;
  closed: boolean;
  openTime: string | null;
  closeTime: string | null;
};

type TagLike = {
  id: string;
  name: string;
  minDurationMinutes: number | null;
};

type DockTagWithTag = {
  tag: { id: string; category: string; name: string };
};

function minutesOfDay(date: Date): number {
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function parseHHMM(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function isSameUtcDate(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

/**
 * Checks a booking's time range against a dock's configured operating hours
 * for the day it starts on. Returns a human-readable violation reason, or
 * null if the booking is allowed (including when no hours are configured
 * for that day at all — unrestricted by default).
 */
export function checkOperatingHours(
  operatingHours: OperatingHoursRule[],
  startTime: Date,
  endTime: Date,
): string | null {
  const rule = operatingHours.find((h) => h.dayOfWeek === startTime.getUTCDay());
  if (!rule) return null;

  if (rule.closed) {
    return "Dock is closed on this day";
  }

  if (rule.openTime === null || rule.closeTime === null) {
    return null; // explicitly open 24h
  }

  const openMinutes = parseHHMM(rule.openTime);
  const closeMinutes = parseHHMM(rule.closeTime);

  if (
    !isSameUtcDate(startTime, endTime) ||
    minutesOfDay(startTime) < openMinutes ||
    minutesOfDay(endTime) > closeMinutes
  ) {
    return `Dock is only open ${rule.openTime}–${rule.closeTime} UTC on this day`;
  }

  return null;
}

/** Returns the names of CARRIER_REQUIREMENT tags the dock requires that the carrier doesn't have. */
export function findMissingCarrierTags(dockTags: DockTagWithTag[], carrierTagIds: Set<string>): string[] {
  return dockTags
    .filter((dt) => dt.tag.category === "CARRIER_REQUIREMENT" && !carrierTagIds.has(dt.tag.id))
    .map((dt) => dt.tag.name);
}

/** Returns the names of declared commodity tags the dock doesn't accept (empty dock tag list = unrestricted). */
export function findUnacceptedCommodities(dockTags: DockTagWithTag[], declaredTags: TagLike[]): string[] {
  const accepted = dockTags.filter((dt) => dt.tag.category === "COMMODITY");
  if (accepted.length === 0) return [];

  const acceptedIds = new Set(accepted.map((dt) => dt.tag.id));
  return declaredTags.filter((t) => !acceptedIds.has(t.id)).map((t) => t.name);
}

/** The longest minimum-duration requirement among the declared commodity tags, or 0 if none apply. */
export function requiredMinDurationMinutes(declaredTags: TagLike[]): number {
  return declaredTags.reduce((max, t) => Math.max(max, t.minDurationMinutes ?? 0), 0);
}

/**
 * Portal bookings only — checked explicitly by carrier-facing call sites, not by
 * runCreateBooking, since staff already have notice when they create a booking.
 */
export function checkLeadTime(minLeadTimeMinutes: number | null, startTime: Date, now: Date): string | null {
  if (!minLeadTimeMinutes) return null;
  const minutesUntilStart = (startTime.getTime() - now.getTime()) / 60000;
  if (minutesUntilStart < minLeadTimeMinutes) {
    return `This dock requires at least ${minLeadTimeMinutes} minutes of advance notice`;
  }
  return null;
}
