import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, QrCode, PackageOpen, CircleCheck, TriangleAlert } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { PERMISSION_CODES } from "@/lib/rbac";
import { resolveHandover } from "@/lib/handover";
import { verifyScanToken } from "@/lib/qr-token";
import { confirmHandoverAction } from "@/app/actions/handover";
import { StatusBadge, PageHeader, EmptyState, cardCls, btnPrimary } from "@/components/ui";
import { bedDisplayName } from "@/lib/bed-info";

export const dynamic = "force-dynamic";

const ERR_MESSAGES: Record<string, string> = {
  "no-delivery": "Tidak ada pengantaran aktif untuk pasien ini.",
  "not-arrived": "Robot belum tiba di ruang. Konfirmasi hanya setelah status Mock: Tiba.",
  "invalid-token": "QR tidak valid atau sudah kedaluwarsa. Cetak ulang gelang pasien.",
};

export default async function ScanPage({
  params,
  searchParams,
}: {
  params: Promise<{ mrn: string }>;
  searchParams: Promise<{ ok?: string; err?: string; t?: string }>;
}) {
  const { mrn } = await params;
  const query = await searchParams;
  const user = await getCurrentUser();
  const canConfirm = hasPermission(user, PERMISSION_CODES.DELIVERY_CREATE);

  // Verifikasi tanda tangan QR SEBELUM menyentuh database: MRN bisa ditebak,
  // jadi MRN tanpa token valid tidak boleh membocorkan apakah pasien ada.
  if (!verifyScanToken(mrn, query.t)) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <Link href="/pasien" className="text-slate-400 transition hover:text-slate-700" aria-label="Kembali">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <PageHeader icon={QrCode} title="QR Tidak Valid" subtitle="Token scan gagal diverifikasi." />
        </div>
        <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="font-semibold">{ERR_MESSAGES["invalid-token"]}</p>
        </div>
      </div>
    );
  }

  const info = await resolveHandover(mrn);
  if (!info) notFound();

  const { patient, delivery } = info;
  const confirmed = delivery?.status === "MOCK_HANDOVER_CONFIRMED";
  const arrived = delivery?.status === "MOCK_ARRIVED_AT_ROOM";

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/pasien" className="text-slate-400 transition hover:text-slate-700" aria-label="Kembali">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <PageHeader
            icon={QrCode}
            title="Hasil Scan Pasien"
            subtitle={`QR hanya membawa URL data pasien. Detail dibaca live dari database.`}
          />
        </div>
      </div>

      {query.ok === "1" && (
        <div className="flex items-start gap-3 rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm text-teal-800">
          <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="font-semibold">Serah-terima tercatat. Obat sudah diserahkan ke pasien.</p>
        </div>
      )}
      {query.err && (
        <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="font-semibold">{ERR_MESSAGES[query.err] ?? "Konfirmasi gagal."}</p>
        </div>
      )}

      <div className={cardCls}>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Identitas Pasien</h2>
        <dl className="space-y-2.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-500">Nama</dt>
            <dd className="font-semibold text-slate-900">{patient.fullName}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">MRN</dt>
            <dd className="font-mono text-xs font-semibold text-teal-700">{patient.mrn}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Ruang</dt>
            <dd className="font-mono text-xs font-bold text-teal-700">{patient.roomCode ?? "-"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Bed</dt>
            <dd className="text-xs font-semibold text-slate-900">{bedDisplayName(patient.bedNumber)}</dd>
          </div>
          {patient.diagnosis && (
            <div className="flex justify-between">
              <dt className="text-slate-500">Diagnosis</dt>
              <dd className="text-slate-700">{patient.diagnosis}</dd>
            </div>
          )}
        </dl>
        {patient.isInfectious && (
          <p className="mt-3 rounded-lg bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-800">
            ALERT: pasien menular. Terapkan kewaspadaan transmisi saat serah-terima.
          </p>
        )}
        {patient.discharged && (
          <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600">
            Pasien sudah pulang (riwayat). Serah-terima tidak berlaku.
          </p>
        )}
      </div>

      {!delivery ? (
        <EmptyState
          icon={PackageOpen}
          message="Tidak ada pengantaran aktif untuk pasien ini."
          action={
            <Link href="/pengantaran" className="text-sm font-semibold text-teal-700 hover:underline">
              Lihat daftar pengantaran
            </Link>
          }
        />
      ) : (
        <div className={cardCls}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Pengantaran Aktif</h2>
            <StatusBadge status={delivery.status} />
          </div>
          <dl className="space-y-2.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Kode Request</dt>
              <dd className="font-mono text-xs font-semibold text-teal-700">{delivery.requestCode}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Kode Resep</dt>
              <dd className="font-mono text-xs font-semibold text-slate-900">{delivery.prescriptionCode}</dd>
            </div>
          </dl>

          {delivery.compartmentNo !== null && (
            <div className="mt-4 rounded-xl border border-teal-200 bg-teal-50 p-4 text-center">
              <p className="text-xs font-medium text-teal-700">Ambil obat dari kompartemen</p>
              <p className="mt-1 text-4xl font-bold text-teal-800">{delivery.compartmentNo}</p>
            </div>
          )}

          <ul className="mt-4 space-y-1">
            {delivery.items.map((item, i) => (
              <li key={i} className="text-xs text-slate-500">
                • {item.name} - {item.quantity} {item.unit}
                {item.instructions ? ` (${item.instructions})` : ""}
              </li>
            ))}
          </ul>

          {confirmed ? (
            <p className="mt-4 flex items-center gap-2 rounded-lg bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-800">
              <CircleCheck className="h-4 w-4" /> Serah-terima sudah dikonfirmasi.
            </p>
          ) : arrived && !patient.discharged ? (
            canConfirm ? (
              <form action={confirmHandoverAction.bind(null, patient.mrn, query.t ?? "")} className="mt-4">
                <button type="submit" className={btnPrimary}>
                  <CircleCheck className="h-4 w-4" />
                  Konfirmasi Serah-Terima
                </button>
                <p className="mt-2 text-xs text-slate-500">
                  Satu klik. Pastikan identitas pasien cocok sebelum konfirmasi.
                </p>
              </form>
            ) : (
              <p className="mt-4 text-xs text-slate-500">
                Akun ini tidak punya izin konfirmasi serah-terima.
              </p>
            )
          ) : (
            <p className="mt-4 text-xs text-slate-500">
              Robot belum tiba di ruang. Tombol konfirmasi muncul setelah status Mock: Tiba.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
