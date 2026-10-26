import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileText, AlertTriangle, Truck } from "lucide-react";
import PrescriptionActions from "@/components/PrescriptionActions";
import { StatusBadge, cardCls, btnPrimary } from "@/components/ui";
import { deliveryStatusLabel } from "@/lib/delivery-status";
import { PERMISSION_CODES } from "@/lib/rbac";
import { bedDisplayName } from "@/lib/bed-info";

export const dynamic = "force-dynamic";

export default async function ResepDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();

  const rx = await prisma.prescription.findUnique({
    where: { id },
    include: {
      patient: { include: { bed: { select: { bedNumber: true } } } },
      doctor: { select: { fullName: true, username: true } },
      verifiedBy: { select: { fullName: true } },
      items: { include: { medicine: true } },
      deliveryRequests: {
        include: { requestedBy: { select: { fullName: true } } },
      },
    },
  });

  if (!rx) notFound();

  const canRequestDelivery =
    user?.roles.includes("SYSTEM_ADMIN") ||
    user?.permissions.includes(PERMISSION_CODES.DELIVERY_CREATE);
  const hasActiveDelivery = rx.deliveryRequests.some((d) =>
    ["DELIVERY_REQUESTED", "PENDING_INTEGRATION", "MOCK_IN_TRANSIT"].includes(d.status)
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/resep" className="text-slate-400 transition hover:text-slate-700" aria-label="Kembali">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <FileText className="h-5 w-5 text-teal-700" />
            {rx.code}
          </h1>
          <p className="text-xs text-slate-500">
            Dibuat {new Date(rx.createdAt).toLocaleString("id-ID")}
          </p>
        </div>
        <StatusBadge status={rx.status} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Patient info */}
        <div className={cardCls}>
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Pasien</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Nama</dt>
              <dd className="font-medium text-slate-900">{rx.patient.fullName}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">MRN</dt>
              <dd className="font-mono text-xs text-teal-700">{rx.patient.mrn}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Ruang</dt>
              <dd className="font-mono text-xs text-slate-600">{rx.patient.roomCode ?? "-"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Bed</dt>
              <dd className="text-xs font-semibold text-slate-900">
                {bedDisplayName(rx.patient.bed?.bedNumber)}
              </dd>
            </div>
          </dl>
        </div>

        {/* Doctor & pharmacist info */}
        <div className={cardCls}>
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Petugas</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Dokter</dt>
              <dd className="font-medium text-slate-900">dr. {rx.doctor.fullName}</dd>
            </div>
            {rx.verifiedBy && (
              <div className="flex justify-between">
                <dt className="text-slate-500">Farmasis</dt>
                <dd className="font-medium text-slate-900">{rx.verifiedBy.fullName}</dd>
              </div>
            )}
            {rx.verifiedAt && (
              <div className="flex justify-between">
                <dt className="text-slate-500">Waktu Verifikasi</dt>
                <dd className="text-slate-600">{new Date(rx.verifiedAt).toLocaleString("id-ID")}</dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      {/* Rejection reason */}
      {rx.status === "REJECTED" && rx.rejectionReason && (
        <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Alasan Penolakan</p>
            <p className="mt-1">{rx.rejectionReason}</p>
          </div>
        </div>
      )}

      {/* Prescription items */}
      <div className={cardCls}>
        <h2 className="mb-4 text-sm font-semibold text-slate-900">Item Obat ({rx.items.length})</h2>
        <div className="space-y-2">
          {rx.items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
            >
              <div>
                <p className="font-medium text-slate-900">{item.medicine.name}</p>
                <p className="font-mono text-xs text-slate-400">{item.medicine.code}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-slate-900">
                  {item.quantity} {item.medicine.unit}
                </p>
                <p className="text-xs text-slate-500">{item.instructions}</p>
              </div>
            </div>
          ))}
        </div>
        {rx.notes && (
          <p className="mt-3 text-xs text-slate-500">
            <span className="font-semibold text-slate-700">Catatan: </span>
            {rx.notes}
          </p>
        )}
      </div>

      {/* Actions */}
      <PrescriptionActions rx={rx} user={user!} />

      {rx.status === "READY_FOR_DELIVERY" && canRequestDelivery && !hasActiveDelivery && (
        <Link href={`/pengantaran/baru?prescription=${rx.id}`} className={btnPrimary}>
          <Truck className="h-4 w-4" />
          Ajukan Pengantaran
        </Link>
      )}

      {/* Delivery requests */}
      {rx.deliveryRequests.length > 0 && (
        <div className={cardCls}>
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Permintaan Pengantaran</h2>
          <ul className="space-y-2">
            {rx.deliveryRequests.map((d) => (
              <li key={d.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-2.5 text-sm">
                <div>
                  <Link href={`/pengantaran/${d.id}`} className="font-mono text-teal-700 hover:underline">
                    {d.requestCode}
                  </Link>
                  <p className="text-xs text-slate-500">Ruang: {d.roomCode} · {d.requestedBy.fullName}</p>
                </div>
                <span className="text-xs text-slate-500">{deliveryStatusLabel(d.status)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
