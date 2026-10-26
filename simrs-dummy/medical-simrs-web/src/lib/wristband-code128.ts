/**
 * Barcode Code 128 (1D, garis lurus) untuk MRN pasien.
 *
 * Gelang RS nyata lazim memakai barcode 1D Code 128 yang berisi MRN
 * dan dipindai dengan scanner genggam. Pratinjau cetak di SIMRS Dummy
 * menampilkan barcode ini agar bentuknya mendekati gelang asli.
 * QR di gelang tetap dipakai untuk alur demo karena berisi URL
 * halaman serah-terima; barcode 1D tidak bisa membuka URL dari HP.
 *
 * Modul ini server-side saja (bergantung bwip-js/node dan Buffer),
 * tidak diimpor client component.
 */
import bwipjs from "bwip-js/node";

/** MRN aman untuk Code 128: teks ASCII tercetak saja (spasi sampai garis putih ~). */
const MRN_CODE128_PATTERN = /^[\x20-\x7e]+$/;

/**
 * Hasilkan MRN sebagai barcode Code 128 berformat data URL SVG.
 * Mengembalikan null bila MRN kosong, mengandung karakter non-ASCII,
 * atau pembangkitan gagal, supaya halaman gelang tetap merender
 * hanya dengan bagian QR.
 */
export function mrnCode128DataUrl(mrn: string): string | null {
  const text = mrn.trim();
  if (text === "" || !MRN_CODE128_PATTERN.test(text)) {
    return null;
  }

  try {
    const svg = bwipjs.toSVG({
      bcid: "code128",
      text,
      scale: 2,
      height: 10,
      includetext: true,
      textxalign: "center",
    });
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  } catch {
    return null;
  }
}
