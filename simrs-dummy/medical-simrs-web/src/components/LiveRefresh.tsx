"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Muat ulang data server component saat SIMRS menerima perubahan status (SSE)
 * dan tampilkan penanda koneksi. Dipasang sekali di AppShell.
 */
export default function LiveRefresh() {
  const router = useRouter();
  const [live, setLive] = useState(false);
  useEffect(() => {
    const es = new EventSource("/api/live");
    let t: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(t);
      t = setTimeout(() => router.refresh(), 400);
    };
    es.addEventListener("ready", () => setLive(true));
    es.addEventListener("delivery", refresh);
    es.addEventListener("prescription", refresh);
    es.onerror = () => setLive(false);
    return () => { clearTimeout(t); es.close(); };
  }, [router]);
  return (
    <div
      role="status"
      className="fixed bottom-3 right-3 z-30 flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 shadow-sm print:hidden"
    >
      <span className={`h-2 w-2 rounded-full ${live ? "bg-emerald-600" : "bg-slate-400"}`} aria-hidden="true" />
      {live ? "Pembaruan langsung aktif" : "Menyambung…"}
    </div>
  );
}
