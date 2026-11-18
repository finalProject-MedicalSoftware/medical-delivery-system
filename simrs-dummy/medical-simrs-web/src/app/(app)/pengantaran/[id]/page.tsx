import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Truck } from "lucide-react";
import DeliveryStatusActions from "@/components/DeliveryStatusActions";
import { StatusBadge, cardCls } from "@/components/ui";
import { DELIVERY_STATUS_LABELS } from "@/lib/delivery-status";
import { bedDisplayName } from "@/lib/bed-info";
import { patientScanPath } from "@/lib/wristband";
import { signScanToken } from "@/lib/qr-token";

export const dynamic = "force-dynamic";

export default async function PengantaranDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();

  const delivery = await prisma.deliveryRequest.findUnique({
    where: { id },
    include: {
      prescription: {
        include: {
          patient: { include: { bed: { select: { bedNumber: true } } } },
          items: { include: { medicine: { select: { name: true, unit: true } } } },
        },
      },
      room: { include: { ward: true } },
      requestedBy: { select: { fullName: true, username: true } },
      events: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!delivery) notFound();

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/pengantaran" className="text-slate-400 transition hover:text-slate-700" aria-label="Kembali">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <Truck className="h-5 w-5 text-teal-700" />
            {delivery.requestCode}
          </h1>
          <p className="font-mono text-xs text-slate-500">{delivery.id}</p>
          <Link href={`/pengantaran/${delivery.id}/berita-acara`} className="mt-1 inline-block text-xs font-medium text-teal-700 hover:underline">Berita acara serah terima</Link>
        </div>
        <StatusBadge status={delivery.status} />
      </div>

      {delivery.status === "NOT_COLLECTED" && (
        <div role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900">
          <p className="font-semibold">Obat tidak diambil pasien</p>
          <p className="mt-1">
            Robot tiba tetapi obat tidak diambil sampai batas waktu, lalu membawanya kembali. Resep dapat diajukan ulang untuk pengantaran baru.
          </p>
          <p className="mt-1 text-rose-800">
            {delivery.notCollectedAckAt
              ? `Sudah ditindaklanjuti oleh ${delivery.notCollectedAckBy} pada ${new Date(delivery.notCollectedAckAt).toLocaleString("id-ID")}.`
              : "Belum ditindaklanjuti. Tandai dari dashboard setelah obat diambil dari robot."}
          </p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {/* Delivery info */}
        <div className={cardCls}>
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Info Pengantaran</h2>
          <dl className="space-y-2.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Kode Request</dt>
              <dd className="font-mono text-xs font-semibold text-teal-700">{delivery.requestCode}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Ruang Tujuan</dt>
              <dd className="font-mono text-xs font-bold text-teal-700">{delivery.roomCode}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Bed Tujuan</dt>
              <dd className="text-xs font-semibold text-slate-900">
                {bedDisplayName(delivery.prescription.patient.bed?.bedNumber)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Bangsal</dt>
              <dd className="text-slate-700">{delivery.room.ward.name}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Pemohon</dt>
              <dd className="text-slate-900">{delivery.requestedBy.fullName}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Waktu Dibuat</dt>
              <dd className="text-slate-700">{new Date(delivery.requestedAt).toLocaleString("id-ID")}</dd>
            </div>
            {delivery.notes && (
              <div>
                <dt className="text-slate-500">Catatan</dt>
                <dd className="mt-1 text-slate-700">{delivery.notes}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Prescription summary */}
        <div className={cardCls}>
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Resep Terkait</h2>
          <Link
            href={`/resep/${delivery.prescription.id}`}
            className="font-mono text-sm font-semibold text-teal-700 hover:underline"
          >
            {delivery.prescription.code}
          </Link>
          <p className="mt-1 text-sm font-medium text-slate-900">{delivery.prescription.patient.fullName}</p>
          <p className="font-mono text-xs text-slate-500">
            {delivery.prescription.patient.mrn} · {bedDisplayName(delivery.prescription.patient.bed?.bedNumber)}
          </p>
          <ul className="mt-3 space-y-1">
            {delivery.prescription.items.map((item) => (
              <li key={item.id} className="text-xs text-slate-500">
                • {item.medicine.name} - {item.quantity} {item.medicine.unit}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Actions */}
      <DeliveryStatusActions
        delivery={delivery}
        user={user!}
        scanHref={patientScanPath(delivery.prescription.patient.mrn, signScanToken(delivery.prescription.patient.mrn))}
        patientHref={`/pasien/${delivery.prescription.patient.id}`}
      />

      {/* Event timeline */}
      <div className={cardCls}>
        <h2 className="mb-4 text-sm font-semibold text-slate-900">
          Riwayat Status ({delivery.events.length})
        </h2>
        {delivery.events.length === 0 ? (
          <p className="text-xs text-slate-400">Belum ada event</p>
        ) : (
          <ol className="relative space-y-4 border-l border-slate-200 pl-5">
            {delivery.events.map((ev) => (
              <li key={ev.id} className="relative">
                <span
                  aria-hidden="true"
                  className="absolute -left-[27px] top-1 h-3 w-3 rounded-full bg-teal-600"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-900">{DELIVERY_STATUS_LABELS[ev.statusAfter as keyof typeof DELIVERY_STATUS_LABELS] ?? ev.statusAfter}</span>
                  </div>
                  {ev.statusBefore && (
                    <p className="text-xs text-slate-400">dari: {DELIVERY_STATUS_LABELS[ev.statusBefore as keyof typeof DELIVERY_STATUS_LABELS] ?? ev.statusBefore}</p>
                  )}
                  {ev.notes && <p className="text-xs text-slate-500">{ev.notes}</p>}
                  <p className="text-xs text-slate-400">
                    {new Date(ev.createdAt).toLocaleString("id-ID")}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
