"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createDeliveryRequestAction } from "@/app/actions/delivery";
import { useConfirm } from "@/components/Confirm";
import { useToast } from "@/components/Toast";
import { bedDisplayName } from "@/lib/bed-info";
import Select from "@/components/Select";
import Link from "next/link";
import { ArrowLeft, Truck, AlertTriangle, Info, BedDouble } from "lucide-react";
import { inputCls, labelCls, cardCls, btnPrimary, btnSecondary } from "@/components/ui";

interface Prescription {
  id: string;
  code: string;
  patient: {
    fullName: string;
    mrn: string;
    roomCode: string | null;
    bed: { bedNumber: string } | null;
  };
}
interface Room {
  id: string;
  roomCode: string;
  name: string;
  ward: { name: string };
}

export default function CreateDeliveryForm({
  readyPrescriptions,
  rooms,
  initialPrescriptionId,
}: {
  readyPrescriptions: Prescription[];
  rooms: Room[];
  initialPrescriptionId?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const initialRx = readyPrescriptions.find((r) => r.id === initialPrescriptionId);
  const [rxId, setRxId] = useState(initialRx?.id ?? "");
  const [roomCode, setRoomCode] = useState(initialRx?.patient.roomCode ?? "");
  const roomTouched = useRef(false);
  const confirm = useConfirm();
  const formRef = useRef<HTMLFormElement>(null);

  const selectedRx = readyPrescriptions.find((r) => r.id === rxId);
  const autoRoom = selectedRx?.patient.roomCode ?? "";

  function handleRxChange(v: string) {
    setRxId(v);
    // Auto-fill ruang tujuan dari ruang pasien; tetap bisa diubah manual
    if (!roomTouched.current) {
      const r = readyPrescriptions.find((x) => x.id === v);
      setRoomCode(r?.patient.roomCode ?? "");
    }
  }

  async function handleConfirmSubmit() {
    const ok = await confirm({
      title: "Ajukan pengantaran?",
      message: "Permintaan antar obat akan dibuat dan dicatat di audit trail.",
      confirmLabel: "Ajukan",
    });
    if (!ok || !formRef.current) return;
    const fd = new FormData(formRef.current);
    setError(null);
    startTransition(async () => {
      const res = await createDeliveryRequestAction(fd);
      if (res.ok) {
        window.setTimeout(() => toast.success("Permintaan pengantaran dibuat"), 400);
        router.push(res.to ?? "/pengantaran");
      } else {
        setError(res.error ?? "Gagal mengajukan pengantaran");
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/pengantaran" className="text-slate-400 transition hover:text-slate-700" aria-label="Kembali">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
          <Truck className="h-5 w-5 text-teal-700" />
          Ajukan Permintaan Pengantaran
        </h1>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-800">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Hanya resep berstatus <strong>READY_FOR_DELIVERY</strong> yang dapat diajukan. Setelah diajukan, status akan dicatat sebagai{" "}
          <strong>DELIVERY_REQUESTED</strong>. Sistem tidak langsung menggerakkan robot.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {readyPrescriptions.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
          <Truck className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-2 text-sm text-slate-500">
            Tidak ada resep dengan status READY_FOR_DELIVERY saat ini.
          </p>
          <Link href="/resep" className="mt-3 inline-block text-sm font-medium text-teal-700 hover:underline">
            Lihat daftar resep →
          </Link>
        </div>
      ) : (
        <form ref={formRef} onSubmit={(e) => e.preventDefault()} className="space-y-5">
          <div className={cardCls}>
            <h2 className="mb-4 text-sm font-semibold text-slate-900">Detail Pengantaran</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="prescriptionId" className={labelCls}>
                  Resep <span className="text-rose-500">*</span>
                </label>
                <Select
                  name="prescriptionId"
                  ariaLabel="Resep siap kirim"
                  placeholder="- Pilih Resep Siap Kirim -"
                  value={rxId}
                  onChange={handleRxChange}
                  options={readyPrescriptions.map((rx) => ({
                    value: rx.id,
                    label: `${rx.code} - ${rx.patient.fullName} (${rx.patient.mrn})`,
                  }))}
                />
              </div>
              <div>
                <label htmlFor="roomCode" className={labelCls}>
                  Ruang Tujuan <span className="text-rose-500">*</span>
                </label>
                <Select
                  name="roomCode"
                  ariaLabel="Ruang tujuan"
                  placeholder="- Pilih Ruang -"
                  value={roomCode}
                  onChange={(v) => {
                    roomTouched.current = true;
                    setRoomCode(v);
                  }}
                  options={rooms.map((r) => ({
                    value: r.roomCode,
                    label: `${r.roomCode} - ${r.name} (${r.ward.name})`,
                  }))}
                />
                {autoRoom && roomCode === autoRoom && (
                  <p className="mt-1 text-[11px] text-teal-700">
                    Otomatis dari ruang pasien ({autoRoom}) - bisa diubah.
                  </p>
                )}
                {selectedRx && (
                  <div className="mt-2 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    <BedDouble className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-700" />
                    <p>
                      Pasien: <span className="font-semibold text-slate-900">{selectedRx.patient.fullName}</span>
                      {" · "}Bed:{" "}
                      <span className="font-semibold text-slate-900">
                        {bedDisplayName(selectedRx.patient.bed?.bedNumber)}
                      </span>
                      {!selectedRx.patient.bed && (
                        <span className="text-slate-500"> (rawat jalan, antar ke ruang tujuan)</span>
                      )}
                    </p>
                  </div>
                )}
              </div>
            </div>
            <div className="mt-4">
              <label htmlFor="notes" className={labelCls}>
                Catatan (opsional)
              </label>
              <input
                id="notes"
                name="notes"
                type="text"
                placeholder="Catatan tambahan untuk pengantaran…"
                className={inputCls}
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="button" onClick={handleConfirmSubmit}
              id="btn-submit-delivery"
              disabled={isPending}
              className={btnPrimary}
            >
              {isPending ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Memproses…
                </>
              ) : (
                "Ajukan Pengantaran"
              )}
            </button>
            <Link
              href="/pengantaran"
              className={btnSecondary}
            >
              Batal
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}
