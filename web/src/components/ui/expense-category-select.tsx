"use client";

import { useRouter } from "next/navigation";
import { expenseCategoryLabel } from "@/lib/format";

/** Imports its own label lookup: function props can't cross the Server -> Client boundary. */
export function ExpenseCategorySelect({
  basePath, categories, value, allLabel = "todas", preserveParams,
}: {
  basePath: string;
  categories: string[];
  value?: string;
  allLabel?: string;
  preserveParams?: Record<string, string | undefined>;
}) {
  const router = useRouter();

  return (
    <label className="flex items-center gap-2">
      <span className="mono-label">categoria</span>
      <select
        value={value ?? ""}
        onChange={(e) => {
          const c = e.target.value;
          const params = new URLSearchParams();
          for (const [key, value] of Object.entries(preserveParams ?? {})) {
            if (value) params.set(key, value);
          }
          if (c) params.set("categoria", c);
          else params.delete("categoria");
          const query = params.toString();
          router.push(query ? `${basePath}?${query}` : basePath);
        }}
        className="mono rounded-[var(--r-md)] border border-[var(--border-1)] bg-[var(--card-tone)] px-2.5 py-1.5 text-[12px] text-[var(--fg-1)] outline-none focus:border-[var(--border-2)]"
        aria-label="filtrar por categoria"
      >
        <option value="">{allLabel}</option>
        {categories.map((c) => (
          <option key={c} value={c}>{expenseCategoryLabel(c)}</option>
        ))}
      </select>
    </label>
  );
}
