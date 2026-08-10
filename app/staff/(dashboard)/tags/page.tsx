import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getStaffMember } from "@/lib/staff-session";
import { canManageTagDefinitions } from "@/lib/staff-roles";
import { TagCategory } from "@/app/generated/prisma/client";

const CATEGORY_LABELS: Record<string, string> = {
  EQUIPMENT: "Equipment",
  COMMODITY: "Commodity",
  CARRIER_REQUIREMENT: "Carrier Requirement",
};

async function createTag(formData: FormData) {
  "use server";

  const staff = await getStaffMember();
  if (!staff || !canManageTagDefinitions(staff.role)) return;

  const category = String(formData.get("category") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const minDurationRaw = String(formData.get("minDurationMinutes") ?? "").trim();

  if (!name || !Object.values(TagCategory).includes(category as TagCategory)) return;

  const minDurationMinutes = minDurationRaw ? Number.parseInt(minDurationRaw, 10) : undefined;

  await prisma.tag.create({
    data: {
      category: category as TagCategory,
      name,
      minDurationMinutes: Number.isInteger(minDurationMinutes) ? minDurationMinutes : undefined,
    },
  });

  revalidatePath("/staff/tags");
}

export default async function StaffTagsPage() {
  const staff = await getStaffMember();
  if (!staff) return null;
  if (!canManageTagDefinitions(staff.role)) {
    return <p className="text-sm text-zinc-600 dark:text-zinc-400">You don&apos;t have access to this page.</p>;
  }

  const tags = await prisma.tag.findMany({ orderBy: [{ category: "asc" }, { name: "asc" }] });
  const grouped = Object.values(TagCategory).map((category) => ({
    category,
    tags: tags.filter((t) => t.category === category),
  }));

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="mb-4 text-xl font-semibold text-black dark:text-zinc-50">Create a Tag</h1>
        <form
          action={createTag}
          className="flex flex-col gap-4 rounded-2xl border border-black/[.08] bg-white p-5 dark:border-white/[.145] dark:bg-[#0a0a0a] sm:flex-row sm:flex-wrap sm:items-end"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="category" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Category
            </label>
            <select
              id="category"
              name="category"
              required
              className="h-10 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            >
              {Object.values(TagCategory).map((category) => (
                <option key={category} value={category}>
                  {CATEGORY_LABELS[category]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="name" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              className="h-10 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="minDurationMinutes" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Min. Duration (minutes)
            </label>
            <input
              id="minDurationMinutes"
              name="minDurationMinutes"
              type="number"
              min="0"
              placeholder="Commodity tags only"
              className="h-10 w-48 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            />
          </div>
          <button
            type="submit"
            className="h-10 rounded-full bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            Create Tag
          </button>
        </form>
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">
          Min. duration only applies to Commodity tags — a booking declaring that commodity must be at least this long.
        </p>
      </section>

      {grouped.map(({ category, tags: categoryTags }) => (
        <section key={category}>
          <h2 className="mb-3 text-lg font-medium text-black dark:text-zinc-50">{CATEGORY_LABELS[category]}</h2>
          {categoryTags.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-500">No {CATEGORY_LABELS[category].toLowerCase()} tags yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-black/[.06] rounded-2xl border border-black/[.08] bg-white px-4 dark:divide-white/[.08] dark:border-white/[.145] dark:bg-[#0a0a0a]">
              {categoryTags.map((tag) => (
                <li key={tag.id} className="flex items-center justify-between gap-2 py-3">
                  <span className="text-sm text-black dark:text-zinc-50">{tag.name}</span>
                  {tag.minDurationMinutes !== null && (
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">min {tag.minDurationMinutes} min</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
