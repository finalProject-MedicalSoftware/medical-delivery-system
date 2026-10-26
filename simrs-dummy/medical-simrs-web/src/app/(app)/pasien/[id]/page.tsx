import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, User, Pencil, Biohazard, QrCode } from "lucide-react";
import DischargePanel from "@/components/DischargePanel";
import { StatusBadge, btnSecondary, cardCls } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function PasienDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  const patient = await prisma.patient.findUnique({
    where: { id },
    include: {
      bed: { select: { bedNumber: true } },
      prescriptions: {
        orderBy: { createdAt: "desc" },
        include: {
          doctor: { select: { fullName: true } },
          items: { include: { medicine: { select: { name: true, unit: true } } } },
        },
      },
    },
  });

  if (!patient) notFound();

  const canEdit =
    user?.roles.includes("SYSTEM_ADMIN") ||
    user?.permissions.includes("master:manage");

  const canCreateRx =
    user?.roles.includes("SYSTEM_ADMIN") ||
    user?.permissions.includes("prescription:create");

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/pasien" className="text-slate-400 transition hover:text-slate-700" aria-label="Kembali">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <User className="h-5 w-5 text-teal-700" />
            {patient.fullName}
          </h1>
          <p className="font-mono text-xs text-slate-500">{patient.mrn}</p>
        </div>
        <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
          SINTETIS
        </span>
        {canEdit && (
          <Link href={`/pasien/${patient.id}/edit`} className={btnSecondary}>
            <Pencil className="h-3.5 w-3.5" />
            Ubah
          </Link>
        )}
        {patient.bed && !patient.dischargedAt && (
          <Link href={`/pasien/${patient.id}/gelang`} className={btnSecondary}>
            <QrCode className="h-3.5 w-3.5" />
            Gelang
          </Link>
        )}
      </div>

      {patient.isInfectious && (
        <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <Biohazard className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">ALERT INFEKSI</p>
            <p className="mt-0.5">
              Pasien terindikasi penyakit menular
              {patient.diagnosis ? ` (${patient.diagnosis})` : ""} - terapkan
              kewaspadaan transmisi (kontak/droplet/airborne). Data ini ikut
              dilempar ke website monitoring.
            </p>
          </div>
        </div>
      )}

      <div className={cardCls}>
        <h2 className="mb-4 text-sm font-semibold text-slate-900">Data Demografis</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          {[
            { label: "MRN", val: patient.mrn },
            { label: "Gender", val: patient.gender === "L" ? "Laki-laki" : "Perempuan" },
            { label: "Tgl Lahir", val: new Date(patient.dateOfBirth).toLocaleDateString("id-ID") },
            { label: "Ruang Rawat", val: patient.roomCode ?? "-" },
            { label: "Bed", val: patient.bed ? `Bed ${patient.bed.bedNumber}` : "-" },
            { label: "Diagnosis", val: patient.diagnosis ?? "-" },
            { label: "Catatan", val: patient.notes ?? "-" },
          ].map((d) => (
            <div key={d.label}>
              <dt className="text-xs text-slate-500">{d.label}</dt>
              <dd className="mt-0.5 font-medium text-slate-900">{d.val}</dd>
            </div>
          ))}
        </dl>
      </div>

      {canEdit && (
        <DischargePanel
          patientId={patient.id}
          roomCode={patient.roomCode}
          canCreateRx={canCreateRx ?? false}
          discharged={
            patient.dischargedAt
              ? {
                  at: patient.dischargedAt.toISOString(),
                  note: patient.dischargeNote,
                }
              : null
          }
        />
      )}

      <div className={cardCls}>
        <h2 className="mb-4 text-sm font-semibold text-slate-900">
          Riwayat Resep ({patient.prescriptions.length})
        </h2>
        {patient.prescriptions.length === 0 ? (
          <p className="text-xs text-slate-400">Belum ada resep</p>
        ) : (
          <ul className="space-y-3">
            {patient.prescriptions.map((rx) => (
              <li key={rx.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/resep/${rx.id}`} className="font-mono text-sm font-semibold text-teal-700 hover:underline">
                    {rx.code}
                  </Link>
                  <StatusBadge status={rx.status} />
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  dr. {rx.doctor.fullName} - {new Date(rx.createdAt).toLocaleDateString("id-ID")}
                </p>
                <ul className="mt-2 space-y-0.5">
                  {rx.items.map((item) => (
                    <li key={item.id} className="text-xs text-slate-500">
                      - {item.medicine.name} ({item.quantity} {item.medicine.unit}) - {item.instructions}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
