import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getStaffMember } from "@/lib/staff-session";
import { canResolveAppeals } from "@/lib/staff-roles";

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(date);
}

async function resolveAppeal(appealId: string, formData: FormData) {
  "use server";

  const staff = await getStaffMember();
  if (!staff || !canResolveAppeals(staff.role)) return;

  const appeal = await prisma.scoreAppeal.findUnique({ where: { id: appealId } });
  if (!appeal || appeal.resolvedAt) return;

  const resolutionNote = String(formData.get("resolutionNote") ?? "").trim();

  await prisma.scoreAppeal.update({
    where: { id: appealId },
    data: { resolvedAt: new Date(), resolutionNote: resolutionNote || undefined },
  });

  redirect("/staff/appeals");
}

export default async function StaffAppealsPage() {
  const staff = await getStaffMember();
  if (!staff) return null;
  if (!canResolveAppeals(staff.role)) {
    return <p className="text-sm text-zinc-600 dark:text-zinc-400">You don&apos;t have access to this page.</p>;
  }

  const appeals = await prisma.scoreAppeal.findMany({
    include: { carrier: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  const open = appeals.filter((a) => !a.resolvedAt);
  const resolved = appeals.filter((a) => a.resolvedAt);

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="mb-4 text-xl font-semibold text-black dark:text-zinc-50">Open Score Appeals</h1>
        {open.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-500">No open appeals.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {open.map((appeal) => {
              const boundResolve = resolveAppeal.bind(null, appeal.id);
              return (
                <li
                  key={appeal.id}
                  className="flex flex-col gap-3 rounded-2xl border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-[#0a0a0a]"
                >
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-black dark:text-zinc-50">{appeal.carrier.name}</span>
                    <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                      {formatDateTime(appeal.createdAt)} UTC
                    </span>
                    <span className="text-sm text-zinc-700 dark:text-zinc-300">{appeal.note}</span>
                  </div>
                  <form action={boundResolve} className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      name="resolutionNote"
                      placeholder="Resolution note (optional)"
                      className="h-8 flex-1 rounded-lg border border-black/[.08] bg-white px-2 text-xs text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
                    />
                    <button
                      type="submit"
                      className="h-8 rounded-full bg-foreground px-3 text-xs font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
                    >
                      Mark Resolved
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium text-black dark:text-zinc-50">Recently Resolved</h2>
        {resolved.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-500">No resolved appeals yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-black/[.06] rounded-2xl border border-black/[.08] bg-white px-4 dark:divide-white/[.08] dark:border-white/[.145] dark:bg-[#0a0a0a]">
            {resolved.map((appeal) => (
              <li key={appeal.id} className="flex flex-col gap-1 py-3">
                <span className="text-sm text-black dark:text-zinc-50">{appeal.carrier.name}</span>
                <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                  {formatDateTime(appeal.createdAt)} UTC
                </span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">{appeal.note}</span>
                {appeal.resolutionNote && (
                  <span className="text-xs text-zinc-600 dark:text-zinc-300">Resolution: {appeal.resolutionNote}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
