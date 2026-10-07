import Link from "next/link";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import { pageList } from "./pagination-shared";

/** No "use client": function props like makeHref can't cross into a Client Component. */
export function PaginationLinks({
  page, totalPages, makeHref, ariaLabel = "paginação", prefetch,
}: { page: number; totalPages: number; makeHref: (page: number) => string; ariaLabel?: string; prefetch?: boolean }) {
  if (totalPages <= 1) return null;

  return (
    <nav className="pagination" aria-label={ariaLabel}>
      {page > 1 ? (
        <Link href={makeHref(page - 1)} className="pagination__btn" aria-label="página anterior" prefetch={prefetch}>
          <ChevronLeft size={14} />
        </Link>
      ) : (
        <span className="pagination__btn" aria-disabled>
          <ChevronLeft size={14} />
        </span>
      )}
      {pageList(page, totalPages).map((p, i) =>
        p === "ellipsis" ? (
          <span key={`e${i}`} className="pagination__ellipsis" aria-hidden>
            <MoreHorizontal size={14} />
          </span>
        ) : p === page ? (
          <span key={p} className="pagination__btn is-active" aria-current="page">
            {p}
          </span>
        ) : (
          <Link key={p} href={makeHref(p)} className="pagination__btn" prefetch={prefetch}>
            {p}
          </Link>
        )
      )}
      {page < totalPages ? (
        <Link href={makeHref(page + 1)} className="pagination__btn" aria-label="próxima página" prefetch={prefetch}>
          <ChevronRight size={14} />
        </Link>
      ) : (
        <span className="pagination__btn" aria-disabled>
          <ChevronRight size={14} />
        </span>
      )}
    </nav>
  );
}
