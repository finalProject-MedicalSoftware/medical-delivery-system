import type { CSSProperties } from "react";
import type { WristbandData } from "@/lib/wristband-data";

/**
 * Gelang identitas pasien rawat inap, ukuran asli media gelang termal 279 x 25 mm.
 *
 * Mengikuti gelang RS di Indonesia:
 *  - warna dasar gelang identitas: biru = laki-laki, merah muda = perempuan;
 *  - penanda risiko: merah = alergi; kuning-jingga = kewaspadaan infeksi (data SIMRS);
 *  - ujung kiri kancing pengunci, ujung kanan lubang penyetel lingkar pergelangan;
 *  - panel label putih: QR (23 mm), identitas (nama kapital, No. RM, tanggal lahir/usia, ruang/bed), barcode Code 128.
 * Semua ukuran dalam mm; `scale` hanya untuk pratinjau di layar (cetak selalu 1).
 */
const BAND_W = 279, BAND_H = 25;
const TONE = {
  L: { band: "#BFDDF7", edge: "#7FB3E3", ink: "#0B4F8A", label: "LAKI-LAKI" },
  P: { band: "#F8C9DA", edge: "#E795B4", ink: "#9D1E54", label: "PEREMPUAN" },
} as const;

const mm = (v: number) => `${v}mm`;
/** Ukuran huruf nama (mm) agar nama kapital muat di kolom 66 mm: ~0,72 x tinggi huruf per karakter. */
const nameSize = (name: string) => Math.max(2.6, Math.min(4.1, 66 / (name.trim().length * 0.72)));
const abs = (x: number, y: number, w: number, h: number): CSSProperties => ({ position: "absolute", left: mm(x), top: mm(y), width: mm(w), height: mm(h) });

export default function Wristband({ data, scale = 1, cutGuide = false }: { data: WristbandData; scale?: number; cutGuide?: boolean }) {
  const t = TONE[data.gender];
  const allergy = data.allergies.length > 0;
  const alerts = [allergy && "allergy", data.isInfectious && "infection"].filter(Boolean) as ("allergy" | "infection")[];
  const holes = Array.from({ length: 10 }, (_, i) => 206 + i * 7);

  return (
    <div
      className="wristband"
      style={{
        position: "relative", width: mm(BAND_W), height: mm(BAND_H), transform: scale === 1 ? undefined : `scale(${scale})`, transformOrigin: "top left",
        background: t.band, borderRadius: "4mm 12.5mm 12.5mm 4mm", boxShadow: `inset 0 0 0 0.35mm ${t.edge}`,
        outline: cutGuide ? "0.2mm dashed #94a3b8" : undefined, outlineOffset: cutGuide ? "1.5mm" : undefined,
        fontFamily: "Arial, Helvetica, sans-serif", color: "#0f172a", overflow: "hidden",
        WebkitPrintColorAdjust: "exact", printColorAdjust: "exact",
      }}
    >
      {/* kancing pengunci */}
      <div style={{ ...abs(4.5, 5, 15, 15), borderRadius: "50%", background: t.edge }} />
      <div style={{ ...abs(7.5, 8, 9, 9), borderRadius: "50%", background: "#ffffff", boxShadow: `inset 0 0 0 0.8mm ${t.band}` }} />
      <div style={{ ...abs(10.5, 11, 3, 3), borderRadius: "50%", background: t.edge }} />

      {/* panel label putih */}
      <div style={{ ...abs(23, 0.9, 172, 23.2), background: "#ffffff", borderRadius: "1.6mm" }}>
        {/* QR besar: URL serah-terima (dibaca HP petugas & kamera tablet robot) */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={data.qrSvgDataUrl} alt={`QR gelang ${data.mrn}`} style={{ ...abs(0.9, 0.6, 22, 22), imageRendering: "pixelated" }} />

        {/* identitas */}
        <div style={{ ...abs(25, 1, 66, 21.4), display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div style={{ fontSize: mm(1.7), fontWeight: 700, letterSpacing: "0.12em", color: t.ink, textTransform: "uppercase", whiteSpace: "nowrap" }}>
            RS Sintetis NEVO · Data demo
          </div>
          {/* nama lengkap harus terbaca utuh: huruf mengecil untuk nama panjang (kolom 66 mm) */}
          <div style={{ fontSize: mm(nameSize(data.fullName)), fontWeight: 800, lineHeight: 1.05, textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {data.fullName}
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: mm(1.5) }}>
            <span style={{ fontSize: mm(2), fontWeight: 700, color: "#475569" }}>NO. RM</span>
            <span style={{ fontSize: mm(3.5), fontWeight: 800, fontFamily: "'Courier New', monospace", letterSpacing: "0.04em" }}>{data.mrn}</span>
          </div>
          <div style={{ fontSize: mm(2.3), lineHeight: 1.2, whiteSpace: "nowrap" }}>
            <b>Tgl lahir</b> {data.birthDate} ({data.age} th) · <b style={{ color: t.ink }}>{t.label}</b>
          </div>
          <div style={{ fontSize: mm(2.3), lineHeight: 1.2, whiteSpace: "nowrap" }}>
            <b>Ruang</b> {data.room} · <b>Bed</b> {data.bed}
          </div>
        </div>

        {/* barcode Code 128 berisi MRN (scanner genggam & kamera tablet) */}
        <div style={{ ...abs(93, 2, 54, 19.2), display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          {data.code128DataUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {/* gambar barcode sudah memuat teks MRN di bawah garis (seperti gelang asli), jadi tidak ditulis ulang */}
              <img src={data.code128DataUrl} alt={`Barcode ${data.mrn}`} style={{ width: mm(52), height: mm(17), objectFit: "fill" }} />
            </>
          ) : (
            <span style={{ fontSize: mm(2), color: "#94a3b8" }}>Barcode tidak tersedia</span>
          )}
        </div>

        {/* penanda risiko (standar warna gelang penanda) atau inisial jenis kelamin */}
        <div style={{ ...abs(149, 0.8, 22, 21.6), display: "flex", flexDirection: "column", gap: mm(0.8) }}>
          {alerts.length === 0 && (
            <div style={{ flex: 1, borderRadius: "1.4mm", background: t.band, color: t.ink, display: "flex", alignItems: "center", justifyContent: "center", fontSize: mm(10), fontWeight: 900 }}>
              {data.gender}
            </div>
          )}
          {alerts.includes("allergy") && (
            <div style={{ flex: 1, borderRadius: "1.4mm", background: "#DC2626", color: "#ffffff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: `0 ${mm(1)}`, overflow: "hidden" }}>
              <span style={{ fontSize: mm(alerts.length > 1 ? 2.8 : 3.4), fontWeight: 900, letterSpacing: "0.08em" }}>ALERGI</span>
              <span style={{ fontSize: mm(1.7), fontWeight: 700, textAlign: "center", lineHeight: 1.1, maxHeight: mm(alerts.length > 1 ? 3.6 : 9), overflow: "hidden" }}>
                {data.allergies.join(", ")}
              </span>
            </div>
          )}
          {alerts.includes("infection") && (
            <div style={{ flex: 1, borderRadius: "1.4mm", background: "#F59E0B", color: "#111827", display: "flex", alignItems: "center", justifyContent: "center", fontSize: mm(2.4), fontWeight: 900, letterSpacing: "0.06em", textAlign: "center", lineHeight: 1.1 }}>
              KEWASPADAAN INFEKSI
            </div>
          )}
        </div>
      </div>

      {/* ekor gelang dengan lubang penyetel */}
      {holes.map((x) => (
        <div key={x} style={{ ...abs(x, 10.9, 3.2, 3.2), borderRadius: "50%", background: "#ffffff", boxShadow: `inset 0 0 0 0.45mm ${t.edge}` }} />
      ))}
    </div>
  );
}

export const WRISTBAND_MM = { width: BAND_W, height: BAND_H };
