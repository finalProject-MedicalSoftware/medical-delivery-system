"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Paginasi daftar: mempertahankan query lain (q/filter/status).
 * Server mem-paginate via take/skip agar list besar tidak lag.
 */
export default function Pagination({
  page,
  totalPages,
}: {
  page: number;
  totalPages: number;
}) {
  const pathname = usePathname();
  const params = useSearchParams();

  if (totalPages <= 1) return null;

  function href(p: number) {
    const next = new URLSearchParams(params.toString());
    next.set("page", String(p));
    return `${pathname}?${next.toString()}`;
  }

  const btn =
    "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50";

  return (
    <nav aria-label="Paginasi" className="flex items-center gap-2">
      {page > 1 ? (
        <Link href={href(page - 1)} className={btn}>
          - Sebelumnya
        </Link>
      ) : (
        <span className={`${btn} cursor-not-allowed opacity-40`}>- Sebelumnya</span>
      )}
      <span className="text-xs text-slate-500">
        Halaman {page} dari {totalPages}
      </span>
      {page < totalPages ? (
        <Link href={href(page + 1)} className={btn}>
          Berikutnya →
        </Link>
      ) : (
        <span className={`${btn} cursor-not-allowed opacity-40`}>Berikutnya →</span>
      )}
    </nav>
  );
}
