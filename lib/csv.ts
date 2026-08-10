/**
 * Dependency-free CSV serializer — the data behind every report in this app
 * is small/controlled enough (staff-entered names, computed numbers) that a
 * library isn't warranted, matching this app's zero-new-dependency posture.
 */
export function toCsv(headers: string[], rows: (string | number)[][]): string {
  const escape = (v: string | number): string => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers, ...rows].map((row) => row.map(escape).join(",")).join("\n");
}
