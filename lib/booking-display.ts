export const STATUS_STYLES: Record<string, string> = {
  SCHEDULED: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  CHECKED_IN: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  COMPLETED: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  NO_SHOW: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

export const LOAD_TYPE_STYLES: Record<string, string> = {
  INBOUND: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300",
  OUTBOUND: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300",
};

// STANDARD is the common case and intentionally has no badge — only call out the exceptions.
export const PRIORITY_STYLES: Record<string, string> = {
  LOW: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  HIGH: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

export function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(date);
}
