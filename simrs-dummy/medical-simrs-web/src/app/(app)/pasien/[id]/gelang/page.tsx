import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Printer, QrCode } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { btnPrimary, cardCls, labelCls } from "@/components/ui";
import Wristband, { WRISTBAND_MM } from "@/components/Wristband";
import { loadWristband, parseFormat } from "@/lib/wristband-data";

export const dynamic = "force-dynamic";

/**
 * Pratinjau gelang identitas pasien rawat inap.
 * QR berisi URL /scan/{mrn}?t=token (HP petugas, kamera tablet robot); Code 128 berisi MRN (scanner genggam, kamera tablet).
 * QR tidak menyimpan rekam medis. Cetak lewat /cetak/gelang/[id] (satu gelang, tanpa layout aplikasi).
 */
const PREVIEW_SCALE = 0.8;

export default async function GelangPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ format?: string }> }) {
  const { id } = await params;
  const format = parseFormat((await searchParams).format);
  if (!(await getCurrentUser())) notFound();
  const res = await loadWristband(id);
  if (res.kind === "not-found") notFound();
  const mrn = res.kind === "ok" ? res.data.mrn : res.mrn;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href={`/pasien/${id}`} className="text-slate-400 transition hover:text-slate-700" aria-label="Kembali">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <QrCode className="h-5 w-5 text-teal-700" />
            Gelang Identitas Pasien
          </h1>
          <p className="font-mono text-xs text-slate-500">{mrn}</p>
        </div>
      </div>

      {res.kind !== "ok" ? (
        <div className={cardCls}>
          <p className="text-sm font-semibold text-rose-800">Gelang hanya untuk pasien rawat inap aktif.</p>
          <p className="mt-1 text-xs text-slate-500">
            Pasien ini belum punya tempat tidur atau sudah dalam status pulang. Tempatkan bed dulu di menu Bangsal &amp; Ruang sebelum mencetak gelang.
          </p>
        </div>
      ) : (
        <>
          <div className={`${cardCls} overflow-x-auto`}>
            <div className="mx-auto" style={{ width: `${WRISTBAND_MM.width * PREVIEW_SCALE}mm`, height: `${WRISTBAND_MM.height * PREVIEW_SCALE}mm` }}>
              <Wristband data={res.data} scale={PREVIEW_SCALE} />
            </div>
            <p className={`mt-4 text-center ${labelCls}`}>
              Ukuran asli 279 x 25 mm (pratinjau 80%). Warna dasar mengikuti gelang identitas: biru laki-laki, merah muda perempuan.
              Penanda merah = alergi, jingga = kewaspadaan infeksi. QR 22 mm dipindai HP petugas dan kamera tablet robot; barcode Code 128 dipindai scanner genggam.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
            <span className="text-slate-500">Format cetak:</span>
            <Link href={`/pasien/${id}/gelang?format=thermal`} className={`rounded-full px-3 py-1 ${format === "thermal" ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-700"}`}>
              Printer gelang (279 x 25 mm)
            </Link>
            <Link href={`/pasien/${id}/gelang?format=a4`} className={`rounded-full px-3 py-1 ${format === "a4" ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-700"}`}>
              A4 lalu potong
            </Link>
          </div>
          <p className={`text-center ${labelCls}`}>
            {format === "thermal"
              ? "Pilih printer gelang termal, ukuran kertas 279 x 25 mm, skala 100%, margin tidak ada, \"Headers and footers\" mati."
              : "Cetak A4 landscape skala 100%, potong mengikuti garis putus-putus, lalu pasang di pergelangan."}{" "}
            Hasil cetak/PDF berisi tepat satu gelang.
          </p>
          <div className="flex items-center justify-center gap-3">
            <a href={`/cetak/gelang/${id}?format=${format}`} target="_blank" rel="noopener" className={btnPrimary}>
              <Printer className="h-3.5 w-3.5" />
              Cetak Gelang
            </a>
            <Link href={`/pasien/${id}`} className="text-sm text-slate-500 underline hover:text-slate-700">
              Kembali ke detail pasien
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
