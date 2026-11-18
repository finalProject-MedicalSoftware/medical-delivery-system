import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import PrintButton from "@/components/PrintButton";
import { btnPrimary } from "@/components/ui";
import { DELIVERY_STATUS_LABELS } from "@/lib/delivery-status";
import { HANDLING_LABELS, PRIORITY_LABELS } from "@/lib/clinical";

export const dynamic = "force-dynamic";
export const metadata = { title: "Berita Acara Serah Terima - SIMRS" };

export default async function BeritaAcaraPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getCurrentUser())) notFound();

  const d = await prisma.deliveryRequest.findUnique({
    where: { id },
    include: {
      room: { include: { ward: true } },
      requestedBy: { select: { fullName: true } },
      events: { orderBy: { createdAt: "asc" } },
      prescription: {
        include: {
          doctor: { select: { fullName: true } },
          verifiedBy: { select: { fullName: true } },
          patient: { include: { bed: { select: { bedNumber: true } } } },
          items: { include: { medicine: true } },
        },
      },
    },
  });
  if (!d) notFound();

  const actorIds = [...new Set(d.events.map((e) => e.actorId).filter((x): x is string => !!x))];
  const users = actorIds.length ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, fullName: true } }) : [];
  const nameOf = (aid: string | null) => users.find((u) => u.id === aid)?.fullName ?? "Sistem/Robot";
  const p = d.prescription.patient;
  const handover = d.events.find((e) => e.statusAfter === "HANDOVER_CONFIRMED");
  const fmt = (x: Date) => new Date(x).toLocaleString("id-ID");

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <Link href={`/pengantaran/${d.id}`} className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> Kembali
        </Link>
        <PrintButton label="Cetak berita acara" className={btnPrimary} />
      </div>

      <article className="rounded-xl border border-slate-200 bg-white p-8 print:border-0 print:p-0">
        <header className="border-b border-slate-300 pb-4">
          <h1 className="text-xl font-semibold text-slate-900">Berita Acara Serah Terima Obat</h1>
          <p className="mt-1 font-mono text-sm text-slate-600">{d.requestCode} · Resep {d.prescription.code}</p>
        </header>

        <dl className="mt-5 grid grid-cols-[10rem_1fr] gap-y-2 text-sm">
          <dt className="text-slate-500">Pasien</dt>
          <dd className="font-medium text-slate-900">{p.fullName} ({p.mrn})</dd>
          <dt className="text-slate-500">Ruang / bed</dt>
          <dd>{d.room.name} · {d.room.ward.name}{p.bed ? ` · Bed ${p.bed.bedNumber}` : ""}</dd>
          <dt className="text-slate-500">Alergi</dt>
          <dd>{p.allergies.length ? p.allergies.join(", ") : "Tidak tercatat"}</dd>
          <dt className="text-slate-500">Prioritas</dt>
          <dd>{PRIORITY_LABELS[d.prescription.priority]}</dd>
          <dt className="text-slate-500">Dokter / apoteker</dt>
          <dd>dr. {d.prescription.doctor.fullName}{d.prescription.verifiedBy ? ` / ${d.prescription.verifiedBy.fullName}` : ""}</dd>
          <dt className="text-slate-500">Status</dt>
          <dd>{DELIVERY_STATUS_LABELS[d.status]}</dd>
        </dl>

        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b border-slate-300 text-left text-slate-600">
              <th scope="col" className="py-2 font-medium">Obat</th>
              <th scope="col" className="py-2 font-medium">Jumlah</th>
              <th scope="col" className="py-2 font-medium">Aturan pakai</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {d.prescription.items.map((i) => (
              <tr key={i.id}>
                <td className="py-2">
                  {i.medicine.name}
                  {i.medicine.handling !== "NONE" && <span className="ml-2 text-xs text-amber-800">({HANDLING_LABELS[i.medicine.handling]})</span>}
                </td>
                <td className="py-2 tabular-nums">{i.quantity} {i.medicine.unit}</td>
                <td className="py-2">{i.instructions}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 className="mt-6 text-sm font-semibold text-slate-900">Jejak status</h2>
        <ol className="mt-2 space-y-1 text-sm text-slate-600">
          {d.events.map((e) => (
            <li key={e.id}>
              {fmt(e.createdAt)} · {DELIVERY_STATUS_LABELS[e.statusAfter as keyof typeof DELIVERY_STATUS_LABELS] ?? e.statusAfter} · {nameOf(e.actorId)}
            </li>
          ))}
        </ol>

        <div className="mt-8 grid grid-cols-2 gap-8 text-sm">
          <div>
            <p className="text-slate-500">Penerima (perawat)</p>
            <p className="mt-10 border-t border-slate-400 pt-1">{handover ? nameOf(handover.actorId) : "Belum diserahterimakan"}</p>
            {handover && <p className="text-xs text-slate-500">{fmt(handover.createdAt)} · konfirmasi QR</p>}
          </div>
          <div>
            <p className="text-slate-500">Pemohon</p>
            <p className="mt-10 border-t border-slate-400 pt-1">{d.requestedBy.fullName}</p>
          </div>
        </div>
      </article>
    </div>
  );
}
