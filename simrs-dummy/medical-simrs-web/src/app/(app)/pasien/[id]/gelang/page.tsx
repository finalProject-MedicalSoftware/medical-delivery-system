import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, QrCode } from "lucide-react";
import QRCode from "qrcode";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { btnPrimary, cardCls, labelCls } from "@/components/ui";
import PrintButton from "@/components/PrintButton";
import { patientQrUrl } from "@/lib/wristband";
import { mrnCode128DataUrl } from "@/lib/wristband-code128";

export const dynamic = "force-dynamic";

/**
 * Halaman cetak gelang QR pasien rawat inap.
 *
 * Band memakai satuan mm mengikuti ukuran gelang identitas dewasa yang
 * lazim: panjang 270 mm, tebal 25 mm. Muka cetak (data pasien, barcode,
 * QR) dibuat 133 mm, mendekati area cetak gelang asli 100 sampai 136 mm.
 * Sisa panjang band biarkan polos seperti material gelang asli.
 *
 * QR berisi URL /scan/{mrn}; setelah dipindai, data pasien dan status
 * serah-terima diambil dari server oleh petugas yang sudah login.
 * QR tidak menyimpan rekam medis.
 */
export default async function GelangPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    notFound();
  }

  const patient = await prisma.patient.findUnique({
    where: { id },
    select: {
      fullName: true,
      mrn: true,
      gender: true,
      dateOfBirth: true,
      dischargedAt: true,
      roomCode: true,
      bed: { select: { bedNumber: true } },
    },
  });

  if (!patient) notFound();

  // Gelang hanya untuk pasien rawat inap aktif: punya bed dan belum pulang.
  const isActiveInpatient = Boolean(patient.bed) && !patient.dischargedAt;

  const birth = new Date(patient.dateOfBirth);
  const today = new Date();
  let umur = today.getFullYear() - birth.getFullYear();
  const belumBerulangTahunIni =
    birth.getMonth() > today.getMonth() ||
    (birth.getMonth() === today.getMonth() && birth.getDate() > today.getDate());
  if (belumBerulangTahunIni) umur -= 1;

  const genderLabel = patient.gender === "L" ? "Laki-laki" : "Perempuan";
  const identitasRingkas = `${birth.toLocaleDateString("id-ID")} · ${umur} th · ${genderLabel} · ${patient.roomCode ?? "-"} / Bed ${patient.bed?.bedNumber}`;

  const qrDataUrl = isActiveInpatient
    ? await QRCode.toDataURL(patientQrUrl(patient.mrn), {
        errorCorrectionLevel: "M",
        margin: 1,
        width: 240,
      })
    : null;

  const code128DataUrl = isActiveInpatient
    ? mrnCode128DataUrl(patient.mrn)
    : null;

  return (
    <div className="space-y-5">
      {/* Header layar (tidak ikut tercetak) */}
      <div className="gelang-chrome flex items-center gap-3">
        <Link
          href={`/pasien/${id}`}
          className="text-slate-400 transition hover:text-slate-700"
          aria-label="Kembali"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <QrCode className="h-5 w-5 text-teal-700" />
            Gelang QR Pasien
          </h1>
          <p className="font-mono text-xs text-slate-500">{patient.mrn}</p>
        </div>
      </div>

      {!isActiveInpatient ? (
        <div className={cardCls}>
          <p className="text-sm font-semibold text-rose-800">
            Gelang hanya untuk pasien rawat inap aktif.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Pasien ini belum punya tempat tidur atau sudah dalam status pulang.
            Tempatkan bed dulu di menu Bangsal &amp; Ruang sebelum mencetak gelang.
          </p>
        </div>
      ) : (
        <>
          {/*
            Panggung gelang di layar: band ukuran 270x25 mm diperkecil 40%
            supaya muat dalam max-w-md. Saat mencetak, scale direset ke 1
            lewat CSS cetak sehingga hasil print berukuran asli.
          */}
          <div id="gelang-stage" className="relative mx-auto h-[38px] max-w-md">
            {/*
              Band dipusatkan dengan translate -50% -50% (persen dari kotak
              band sendiri), lalu diperkecil dengan scale. Keduanya properti
              individual CSS sehingga aman direset terpisah saat cetak.
            */}
            <div
              id="wristband"
              className="absolute left-1/2 top-1/2 flex h-[25mm] w-[270mm] -translate-x-1/2 -translate-y-1/2 scale-[0.4] rounded-full bg-white ring-2 ring-slate-900"
            >
              {/* Pita warna kiri, ala gelang identitas RS */}
              <span className="h-full w-[3mm] shrink-0 rounded-l-full bg-teal-600" />

              {/* Muka cetak 133 mm (band asli: area cetak 100 sampai 136 mm) */}
              <div className="flex h-full w-[133mm] items-center justify-between gap-[2mm] px-[4mm]">
                <div className="flex min-w-0 flex-col">
                  <span className="text-[1.6mm] font-bold uppercase tracking-[0.08em] text-teal-700">
                    SIMRS Dummy &middot; Data Sintetis
                  </span>
                  <span className="truncate text-[3.4mm] font-bold leading-[1.15] text-slate-900">
                    {patient.fullName}
                  </span>
                  <span className="font-mono text-[2.2mm] font-semibold text-slate-800">
                    MRN {patient.mrn}
                  </span>
                  <span className="text-[2mm] leading-tight text-slate-600">
                    {identitasRingkas}
                  </span>
                </div>

                {/* Barcode Code 128 berisi MRN seperti gelang asli */}
                <div className="flex shrink-0 flex-col items-center">
                  {code128DataUrl ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={code128DataUrl}
                        alt={`Barcode Code 128 MRN ${patient.mrn}`}
                        className="h-[7mm] w-[38mm] object-contain object-center"
                      />
                      <span className="text-center font-mono text-[1.9mm] tracking-[0.12em] text-slate-900">
                        {patient.mrn}
                      </span>
                      <span className="text-[1.5mm] uppercase tracking-wider text-slate-500">
                        Code 128
                      </span>
                    </>
                  ) : (
                    <span className="text-center text-[1.8mm] text-slate-400">
                      Barcode tidak tersedia
                    </span>
                  )}
                </div>

                {/* QR alur demo: pindai HP ke halaman serah-terima */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrDataUrl ?? ""}
                  alt={`QR serah-terima untuk MRN ${patient.mrn}`}
                  className="h-[20mm] w-[20mm] shrink-0"
                />
              </div>

              {/* Sisa panjang band: material kosong seperti gelang asli */}
              <span className="h-full flex-1 rounded-r-full bg-slate-50" />
            </div>
          </div>

          <p className={`text-center ${labelCls}`}>
            Band 270 x 25 mm (muka cetak 133 mm). Pratinjau diperkecil 40% di
            layar; hasil cetak ukuran asli dengan kertas A4 landscape. QR
            dipakai pindai HP, barcode Code 128 dipakai scanner genggam di
            gelang asli.
          </p>

          <div className="gelang-chrome flex items-center justify-center gap-3">
            <PrintButton className={btnPrimary} />
            <Link href={`/pasien/${id}`} className="text-sm text-slate-500 underline hover:text-slate-700">
              Kembali ke detail pasien
            </Link>
          </div>
        </>
      )}

      {/*
        CSS cetak: hanya kotak band yang tampil, ukuran asli 270x25 mm.
        Band dipasang fixed sehingga pemusatannya mengacu ke halaman cetak,
        bukan ke layout aplikasi. Properti translate (-50% -50%) dari kelas
        Tailwind tetap berlaku dan memusatkan band; scale direset ke 1.
        @page meminta A4 landscape supaya band 270 mm muat penuh.
      */}
      <style>{`
        @page { size: A4 landscape; margin: 4mm; }
        @media print {
          body * { visibility: hidden; }
          #wristband, #wristband * { visibility: visible; }
          #wristband {
            position: fixed;
            top: 50%;
            left: 50%;
            scale: 1;
            margin: 0;
          }
        }
      `}</style>
    </div>
  );
}
