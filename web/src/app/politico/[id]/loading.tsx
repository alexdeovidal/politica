import { Skeleton } from "@/components/skeleton";

export default function LoadingPolitico() {
  return (
    <main
      aria-busy="true"
      aria-label="Carregando ficha pública"
      className="mx-auto w-full max-w-4xl pt-8"
    >
      <Skeleton className="mb-8 h-4 w-48" />
      <header className="card mb-7" style={{ padding: "24px" }}>
        <Skeleton className="h-10 w-3/4 max-w-xl" />
        <Skeleton className="mt-4 h-4 w-64 max-w-full" />
        <Skeleton className="mt-6 h-3 w-80 max-w-full" />
        <div className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-24 w-full" style={{ borderRadius: "var(--r-md)" }} />
          ))}
        </div>
      </header>
      <div className="mb-7 flex gap-2 overflow-hidden">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-10 w-24 shrink-0" style={{ borderRadius: "var(--r-md)" }} />
        ))}
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-28 w-full" style={{ borderRadius: "var(--r-md)" }} />
        ))}
      </div>
    </main>
  );
}
