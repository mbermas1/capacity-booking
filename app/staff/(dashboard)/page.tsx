import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/portal-auth";
import { PartnerType } from "@/app/generated/prisma/client";
import { PARTNER_TYPE_LABELS } from "@/lib/partner-type";
import { computeCarrierScore, computeCarrierScoreTrend, type CarrierScore } from "@/lib/carrier-score";

const TIER_STYLES: Record<CarrierScore["tier"], string> = {
  TRUSTED: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  STANDARD: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  FLAGGED: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  INSUFFICIENT_DATA: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

const TIER_LABELS: Record<CarrierScore["tier"], string> = {
  TRUSTED: "Trusted",
  STANDARD: "Standard",
  FLAGGED: "Flagged",
  INSUFFICIENT_DATA: "Not enough history",
};

function ComponentTrendRow({
  label,
  points,
}: {
  label: string;
  points: { periodStart: string; periodEnd: string; value: number | null }[];
}) {
  return (
    <div>
      <span className="text-xs text-zinc-500 dark:text-zinc-400">{label}</span>
      <div className="flex h-6 items-end gap-1">
        {points.map((p) => (
          <div
            key={p.periodStart}
            title={`${p.periodStart} – ${p.periodEnd}: ${
              p.value !== null ? `${Math.round(p.value)}%` : "insufficient data"
            }`}
            className={`flex-1 rounded-t ${p.value !== null ? "bg-foreground" : "bg-zinc-200 dark:bg-zinc-700"}`}
            style={{ height: `${p.value !== null ? Math.max(2, Math.round(p.value)) : 2}%` }}
          />
        ))}
      </div>
    </div>
  );
}

async function createCarrierAccount(formData: FormData) {
  "use server";

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const partnerTypeRaw = String(formData.get("partnerType") ?? "");
  const partnerType = Object.values(PartnerType).includes(partnerTypeRaw as PartnerType)
    ? (partnerTypeRaw as PartnerType)
    : PartnerType.CARRIER;

  if (!name || !email || !password) return;

  await prisma.carrier.upsert({
    where: { name },
    create: { name, email, passwordHash: hashPassword(password), partnerType },
    update: { email, passwordHash: hashPassword(password), partnerType },
  });

  revalidatePath("/staff");
}

async function updateCarrierRequirementTags(carrierId: string, formData: FormData) {
  "use server";

  const selectedTagIds = formData.getAll("tagIds").map(String);

  await prisma.$transaction(async (tx) => {
    await tx.carrierTag.deleteMany({ where: { carrierId, tag: { category: "CARRIER_REQUIREMENT" } } });
    if (selectedTagIds.length > 0) {
      await tx.carrierTag.createMany({ data: selectedTagIds.map((tagId) => ({ carrierId, tagId })) });
    }
  });

  revalidatePath("/staff");
}

export default async function StaffCarriersPage() {
  const [carriers, requirementTags] = await Promise.all([
    prisma.carrier.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { bookings: true } }, tags: { include: { tag: true } } },
    }),
    prisma.tag.findMany({ where: { category: "CARRIER_REQUIREMENT" }, orderBy: { name: "asc" } }),
  ]);
  const scores = new Map(
    await Promise.all(carriers.map(async (c) => [c.id, await computeCarrierScore(c.id)] as const)),
  );
  const scoreTrends = new Map(
    await Promise.all(carriers.map(async (c) => [c.id, await computeCarrierScoreTrend(c.id)] as const)),
  );

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="mb-4 text-xl font-semibold text-black dark:text-zinc-50">
          Create or Reset a Carrier Account
        </h1>
        <form
          action={createCarrierAccount}
          className="flex flex-col gap-4 rounded-2xl border border-black/[.08] bg-white p-5 dark:border-white/[.145] dark:bg-[#0a0a0a] sm:flex-row sm:flex-wrap sm:items-end"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="name" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Carrier Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              list="carrier-names"
              required
              placeholder="Must exactly match existing bookings"
              className="h-10 w-64 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            />
            <datalist id="carrier-names">
              {carriers.map((carrier) => (
                <option key={carrier.id} value={carrier.name} />
              ))}
            </datalist>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="email" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="h-10 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="password" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              className="h-10 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="partnerType" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Partner Type
            </label>
            <select
              id="partnerType"
              name="partnerType"
              defaultValue={PartnerType.CARRIER}
              className="h-10 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            >
              {Object.values(PartnerType).map((type) => (
                <option key={type} value={type}>
                  {PARTNER_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="h-10 rounded-full bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            Save Account
          </button>
        </form>
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">
          If the carrier name already exists, this resets that carrier&rsquo;s email and password
          rather than creating a duplicate.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium text-black dark:text-zinc-50">All Carriers</h2>
        {carriers.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-500">No carriers yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-black/[.06] rounded-2xl border border-black/[.08] bg-white px-4 dark:divide-white/[.08] dark:border-white/[.145] dark:bg-[#0a0a0a]">
            {carriers.map((carrier) => {
              const assignedTagIds = new Set(carrier.tags.map((ct) => ct.tagId));
              const score = scores.get(carrier.id)!;
              const scoreTrend = scoreTrends.get(carrier.id)!;
              return (
                <li key={carrier.id} className="flex flex-col gap-2 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium text-black dark:text-zinc-50">{carrier.name}</span>
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        {carrier.email ?? "no email on file"} · {carrier._count.bookings} booking
                        {carrier._count.bookings === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                        {PARTNER_TYPE_LABELS[carrier.partnerType]}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          carrier.passwordHash
                            ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
                            : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                        }`}
                      >
                        {carrier.passwordHash ? "Login enabled" : "No login"}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TIER_STYLES[score.tier]}`}>
                        {TIER_LABELS[score.tier]}
                        {score.overall !== null ? ` · ${Math.round(score.overall)}` : ""}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-500">
                    On-time {score.onTime.detail} · No-shows {score.noShow.detail} · Dwell {score.dwell.detail} ·
                    Cancellations {score.cancellation.detail}
                  </p>
                  <details>
                    <summary className="cursor-pointer text-xs font-medium text-zinc-500 dark:text-zinc-500">
                      Score history (last {scoreTrend.length} weeks)
                    </summary>
                    <div className="mt-2 flex h-10 items-end gap-1">
                      {scoreTrend.map((bucket) => (
                        <div
                          key={bucket.periodStart}
                          title={`${bucket.periodStart} – ${bucket.periodEnd}: ${
                            bucket.overall !== null ? `${Math.round(bucket.overall)}/100` : "insufficient data"
                          }`}
                          className={`flex-1 rounded-t ${
                            bucket.overall !== null ? "bg-foreground" : "bg-zinc-200 dark:bg-zinc-700"
                          }`}
                          style={{ height: `${bucket.overall !== null ? Math.max(2, Math.round(bucket.overall)) : 2}%` }}
                        />
                      ))}
                    </div>
                    <div className="mt-3 flex flex-col gap-2">
                      <ComponentTrendRow label="On-time" points={scoreTrend.map((b) => ({ ...b, value: b.onTime.value }))} />
                      <ComponentTrendRow
                        label="No-shows"
                        points={scoreTrend.map((b) => ({
                          ...b,
                          value: b.noShow.value !== null ? 100 - b.noShow.value : null,
                        }))}
                      />
                      <ComponentTrendRow
                        label="Dwell efficiency"
                        points={scoreTrend.map((b) => ({ ...b, value: b.dwell.value }))}
                      />
                      <ComponentTrendRow
                        label="Cancellations"
                        points={scoreTrend.map((b) => ({
                          ...b,
                          value: b.cancellation.value !== null ? 100 - b.cancellation.value : null,
                        }))}
                      />
                    </div>
                  </details>
                  {requirementTags.length > 0 && (
                    <form
                      action={updateCarrierRequirementTags.bind(null, carrier.id)}
                      className="flex flex-wrap items-center gap-3"
                    >
                      {requirementTags.map((tag) => (
                        <label key={tag.id} className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                          <input type="checkbox" name="tagIds" value={tag.id} defaultChecked={assignedTagIds.has(tag.id)} />
                          {tag.name}
                        </label>
                      ))}
                      <button
                        type="submit"
                        className="h-7 rounded-full border border-black/[.08] px-3 text-xs font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
                      >
                        Save
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
