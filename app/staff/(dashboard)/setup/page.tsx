import Link from "next/link";
import { CheckCircle2, Circle, ListChecks } from "lucide-react";
import { getStaffMember } from "@/lib/staff-session";
import { canViewSetupGuide } from "@/lib/staff-roles";
import { computeSetupProgress } from "@/lib/warehouse-setup";

export default async function StaffSetupPage() {
  const staff = await getStaffMember();
  if (!staff) return null;
  if (!canViewSetupGuide(staff.role) || !staff.warehouseId || !staff.accountId) {
    return <p className="text-sm text-zinc-600 dark:text-zinc-400">You don&apos;t have access to this page.</p>;
  }

  const { steps, completed, total } = await computeSetupProgress(staff.warehouseId, staff.accountId);
  const pct = Math.round((completed / total) * 100);

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-[#0a0a0a]">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
            <ListChecks className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-black dark:text-zinc-50">Set up your Warehouse</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Complete these steps to get {staff.warehouse?.name ?? "your warehouse"} ready for bookings.
            </p>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">
            {completed} of {total} steps completed
          </span>
          <span className="font-semibold text-black dark:text-zinc-50">{pct}%</span>
        </div>
        <div className="mt-2 flex gap-1">
          {steps.map((s) => (
            <div
              key={s.key}
              className={`h-1.5 flex-1 rounded-full ${s.complete ? "bg-foreground" : "bg-zinc-200 dark:bg-zinc-800"}`}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {steps.map((s) => (
          <details
            key={s.key}
            className="group rounded-2xl border border-black/[.08] bg-white dark:border-white/[.145] dark:bg-[#0a0a0a]"
          >
            <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4">
              {s.complete ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
              ) : (
                <Circle className="h-5 w-5 shrink-0 text-zinc-300 dark:text-zinc-700" />
              )}
              <s.icon className="h-4 w-4 shrink-0 text-zinc-400" strokeWidth={1.75} />
              <span
                className={`text-sm font-medium ${s.complete ? "text-zinc-500 line-through dark:text-zinc-500" : "text-black dark:text-zinc-50"}`}
              >
                {s.label}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  s.required
                    ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                    : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                }`}
              >
                {s.required ? "Required" : "Optional"}
              </span>
              <span className="ml-auto text-xs text-zinc-400 transition-transform group-open:rotate-180">▾</span>
            </summary>

            <div className="flex flex-col gap-3 border-t border-black/[.06] px-5 py-4 dark:border-white/[.08]">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">{s.description}</p>
              <ul className="list-disc pl-5 text-sm text-zinc-600 dark:text-zinc-400">
                {s.whatYoullDo.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <Link
                href={s.href}
                className="inline-flex w-fit items-center gap-1 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
              >
{s.ctaLabel} →
              </Link>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
