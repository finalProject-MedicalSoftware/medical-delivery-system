import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { loadWristband, parseFormat } from "@/lib/wristband-data";
import Wristband from "@/components/Wristband";
import AutoPrint from "@/components/AutoPrint";
import PrintButton from "@/components/PrintButton";

export const dynamic = "force-dynamic";

/**
 * Halaman cetak gelang: SATU gelang, tanpa sidebar/layout aplikasi, sehingga hasil cetak/PDF tepat satu halaman.
 *  - thermal: media gelang termal 279 x 25 mm, tanpa margin (Zebra HC100 / sejenis);
 *  - a4     : A4 landscape, satu gelang di tengah dengan garis potong.
 * (Versi lama memakai visibility:hidden + position:fixed di dalam layout aplikasi → gelang terulang di setiap halaman.)
 */
export default async function CetakGelangPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ format?: string }> }) {
  const { id } = await params;
  const format = parseFormat((await searchParams).format);
  if (!(await getCurrentUser())) notFound();
  const res = await loadWristband(id);
  if (res.kind !== "ok") notFound();

  return (
    <main className={`cetak-gelang ${format}`}>
      <AutoPrint />
      <div className="cetak-bar">
        <span>Pratinjau cetak · {format === "thermal" ? "printer gelang 279 x 25 mm, skala 100%, tanpa margin" : "A4 landscape, skala 100%, potong mengikuti garis putus-putus"}</span>
        <PrintButton className="cetak-btn" label="Cetak lagi" />
      </div>
      <div className="cetak-sheet">
        <Wristband data={res.data} cutGuide={format === "a4"} />
      </div>
      <style>{`
        @page { size: ${format === "thermal" ? "279mm 25mm" : "A4 landscape"}; margin: 0; }
        html, body { margin: 0; padding: 0; background: #e2e8f0; }
        .cetak-bar { display: flex; gap: 12px; align-items: center; justify-content: center; padding: 12px; font: 13px system-ui, sans-serif; color: #334155; }
        .cetak-btn { display: inline-flex; gap: 6px; align-items: center; padding: 6px 12px; border-radius: 8px; background: #0f766e; color: #fff; font-weight: 600; }
        .cetak-sheet { display: flex; justify-content: center; padding: 24px; }
        @media print {
          html, body { background: #fff; }
          .cetak-bar { display: none; }
          .cetak-sheet { padding: 0; }
          .thermal .cetak-sheet { display: block; width: 279mm; height: 25mm; overflow: hidden; }
          .a4 .cetak-sheet { width: 297mm; height: 209mm; overflow: hidden; align-items: center; }
          .wristband { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>
    </main>
  );
}
