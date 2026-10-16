"use client";

import { useRouter } from "next/navigation";

export function YearSelect({
  basePath, years, value, allLabel = "todos", preserveParams,
}: {
  basePath: string;
  years: number[];
  value?: number;
  allLabel?: string;
  preserveParams?: Record<string, string | undefined>;
}) {
  const router = useRouter();
  if (years.length === 0) return null;

  return (
    <select
      value={value ?? ""}
      onChange={(e) => {
        const y = e.target.value;
          const params = new URLSearchParams();
          for (const [key, value] of Object.entries(preserveParams ?? {})) {
            if (value) params.set(key, value);
          }
          if (y) params.set("ano", y);
          else params.delete("ano");
          const query = params.toString();
          router.push(query ? `${basePath}?${query}` : basePath);
      }}
      className="year-select mono rounded-[var(--r-md)] border border-[var(--border-1)] bg-[var(--card-tone)] px-2.5 py-1.5 text-[12px] text-[var(--fg-1)] outline-none focus:border-[var(--border-2)]"
      aria-label="filtrar por ano"
    >
      <option value="">{allLabel}</option>
      {years.map((y) => (
        <option key={y} value={y}>{y}</option>
      ))}
    </select>
  );
}
