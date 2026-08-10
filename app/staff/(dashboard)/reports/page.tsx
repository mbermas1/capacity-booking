import Link from "next/link";
import { getStaffMember } from "@/lib/staff-session";

const REPORTS = [
  {
    href: "/staff/reports/utilization",
    title: "Utilization",
    description: "Capacity used vs. available, by door, day, and hour.",
  },
  {
    href: "/staff/reports/dwell",
    title: "Dwell Time / Detention",
    description: "Dwell time trend plus estimated detention cost.",
  },
  {
    href: "/staff/reports/exceptions",
    title: "No-Show / Exceptions",
    description: "Cancellations, late arrivals, and missed windows.",
  },
  {
    href: "/staff/reports/multi-site",
    title: "Multi-Site Rollup",
    description: "Compare utilization and dwell time across facilities.",
  },
];

export default async function StaffReportsIndexPage() {
  const staff = await getStaffMember();
  if (!staff) return null;

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="mb-1 text-xl font-semibold text-black dark:text-zinc-50">Reports</h1>
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          Each report is printable (use your browser&rsquo;s Print &rarr; Save as PDF) and exportable as CSV.
        </p>
        <ul className="flex flex-col divide-y divide-black/[.06] rounded-2xl border border-black/[.08] bg-white px-4 dark:divide-white/[.08] dark:border-white/[.145] dark:bg-[#0a0a0a]">
          {REPORTS.map((r) => (
            <li key={r.href} className="flex flex-col gap-0.5 py-3">
              <Link href={r.href} className="text-sm font-medium text-black hover:underline dark:text-zinc-50">
                {r.title}
              </Link>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">{r.description}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
