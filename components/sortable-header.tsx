import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

/**
 * Column header for a server-rendered, searchParams-driven sortable table —
 * clicking toggles asc/desc for that column while preserving every other
 * query param (search text, filters) already on the URL.
 */
export function SortableHeader({
  label,
  sortKey,
  basePath,
  searchParams,
}: {
  label: string;
  sortKey: string;
  basePath: string;
  searchParams: Record<string, string | undefined>;
}) {
  const activeDir = searchParams.sort === sortKey ? (searchParams.dir === "desc" ? "desc" : "asc") : null;
  const nextDir = activeDir === "asc" ? "desc" : "asc";

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value !== undefined && key !== "sort" && key !== "dir") params.set(key, value);
  }
  params.set("sort", sortKey);
  params.set("dir", nextDir);

  const Icon = activeDir === "asc" ? ArrowUp : activeDir === "desc" ? ArrowDown : ArrowUpDown;

  return (
    <Link
      href={`${basePath}?${params.toString()}`}
      className={`inline-flex items-center gap-1 hover:text-black dark:hover:text-zinc-50 ${
        activeDir ? "text-black dark:text-zinc-50" : "text-zinc-500 dark:text-zinc-400"
      }`}
    >
      {label}
      <Icon className="h-3.5 w-3.5" />
    </Link>
  );
}
