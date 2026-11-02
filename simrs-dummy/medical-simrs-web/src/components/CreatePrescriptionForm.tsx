"use client";

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPrescriptionAction } from "@/app/actions/prescriptions";
import { useConfirm } from "@/components/Confirm";
import { useToast } from "@/components/Toast";
import { bedDisplayName } from "@/lib/bed-info";
import Select from "@/components/Select";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, FileText, AlertTriangle, Biohazard, Clock } from "lucide-react";
import { inputCls, labelCls, cardCls, btnPrimary, btnSecondary } from "@/components/ui";

interface Patient {
  id: string;
  fullName: string;
  mrn: string;
  roomCode: string | null;
  diagnosis: string | null;
  isInfectious: boolean;
  bed: { bedNumber: string } | null;
}
interface Medicine {
  id: string;
  name: string;
  code: string;
  unit: string;
  stock: number;
}
interface PrescriptionItem {
  medicineId: string;
  quantity: number;
  instructions: string;
}

export default function CreatePrescriptionForm({
  patients,
  medicines,
  initialPatientId,
}: {
  patients: Patient[];
  medicines: Medicine[];
  initialPatientId?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [patientId, setPatientId] = useState(initialPatientId ?? "");
  const selectedPatient = patients.find((p) => p.id === patientId);
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState<PrescriptionItem[]>([
    { medicineId: "", quantity: 1, instructions: "" },
  ]);
  const confirm = useConfirm();
  const formRef = useRef<HTMLFormElement>(null);

  // F1: jadwal minum berulang (kontrak §1.2) — opsional; kosong = satu kali manual.
  const [doseTimes, setDoseTimes] = useState<string[]>([]);
  const [doseTime, setDoseTime] = useState("08:00");
  const [repeatMode, setRepeatMode] = useState("DAILY");
  const [intervalDays, setIntervalDays] = useState("1");

  function addDoseTime() {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(doseTime) || doseTimes.includes(doseTime) || doseTimes.length >= 6) return;
    setDoseTimes((prev) => [...prev, doseTime].sort());
    setDoseTime("");
  }

  function removeDoseTime(t: string) {
    setDoseTimes((prev) => prev.filter((x) => x !== t));
  }

  function addItem() {
    setItems((prev) => [...prev, { medicineId: "", quantity: 1, instructions: "" }]);
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateItem(idx: number, field: keyof PrescriptionItem, value: string | number) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  }

  async function handleConfirmSubmit() {
    const ok = await confirm({
      title: "Ajukan resep?",
      message: `Resep dengan ${items.length} item obat akan diajukan ke farmasi.`,
      confirmLabel: "Ajukan",
    });
    if (!ok || !formRef.current) return;
    const fd = new FormData(formRef.current);
    setError(null);
    startTransition(async () => {
      const res = await createPrescriptionAction(fd);
      if (res.ok) {
        window.setTimeout(() => toast.success("Resep diajukan ke farmasi"), 400);
        router.push(res.to ?? "/resep");
      } else {
        setError(res.error ?? "Gagal mengajukan resep");
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/resep" className="text-slate-400 transition hover:text-slate-700" aria-label="Kembali">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
          <FileText className="h-5 w-5 text-teal-700" />
          Buat Resep Simulasi
        </h1>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <form ref={formRef} onSubmit={(e) => e.preventDefault()} className="space-y-5">
        <input type="hidden" id="items-json" name="items" value={JSON.stringify(items)} />

        {/* Patient selection */}
        <div className={cardCls}>
          <h2 className="mb-4 text-sm font-semibold text-slate-900">Data Pasien & Catatan</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="patientId" className={labelCls}>
                Pasien Sintetis <span className="text-rose-500">*</span>
              </label>
              <Select
                name="patientId"
                ariaLabel="Pasien sintetis"
                placeholder="- Pilih Pasien -"
                value={patientId}
                onChange={setPatientId}
                options={patients.map((p) => ({
                  value: p.id,
                  label: `${p.fullName} (${p.mrn}) · ${
                    p.roomCode ? `${p.roomCode} ${bedDisplayName(p.bed?.bedNumber)}` : "Rawat jalan"
                  }`,
                }))}
              />
              {selectedPatient && (
                <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  <p>
                    Ruang:{" "}
                    <span className="font-mono font-semibold text-slate-900">
                      {selectedPatient.roomCode ?? "-"}
                    </span>
                    {" · "}Bed:{" "}
                    <span className="font-semibold text-slate-900">
                      {bedDisplayName(selectedPatient.bed?.bedNumber)}
                    </span>
                  </p>
                  {selectedPatient.diagnosis && (
                    <p className="mt-0.5">Diagnosis: {selectedPatient.diagnosis}</p>
                  )}
                  {selectedPatient.isInfectious && (
                    <p className="mt-1 flex items-center gap-1 font-semibold text-rose-700">
                      <Biohazard className="h-3.5 w-3.5" />
                      ALERT penyakit menular
                    </p>
                  )}
                </div>
              )}
            </div>
            <div>
              <label htmlFor="notes" className={labelCls}>
                Catatan (opsional)
              </label>
              <input
                id="notes"
                name="notes"
                type="text"
                placeholder="Catatan tambahan dokter…"
                className={inputCls}
              />
            </div>
          </div>
        </div>

        {/* Item list */}
        <div className={cardCls}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">
              Item Obat ({items.length})
            </h2>
            <button
              type="button"
              onClick={addItem}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
            >
              <Plus className="h-3.5 w-3.5" />
              Tambah Obat
            </button>
          </div>

          <div className="space-y-4">
            {items.map((item, idx) => (
              <div key={idx} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500">Obat #{idx + 1}</span>
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      className="text-slate-400 transition hover:text-rose-600"
                      aria-label="Hapus item"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="md:col-span-1">
                    <label className="mb-1 block text-xs text-slate-500">
                      Obat <span className="text-rose-500">*</span>
                    </label>
                    <Select
                      ariaLabel={`Obat item ${idx + 1}`}
                      placeholder="- Pilih Obat -"
                      value={item.medicineId}
                      onChange={(v) => updateItem(idx, "medicineId", v)}
                      options={medicines.map((m) => ({
                        value: m.id,
                        label: `${m.name} (${m.unit}) - stok: ${m.stock}`,
                      }))}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-500">
                      Kuantitas <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      min={1}
                      required
                      value={item.quantity}
                      onChange={(e) => updateItem(idx, "quantity", parseInt(e.target.value))}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-500">
                      Aturan Pakai <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="3x1 tablet sesudah makan"
                      value={item.instructions}
                      onChange={(e) => updateItem(idx, "instructions", e.target.value)}
                      className={inputCls}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* F1: jadwal minum berulang — bahan slot pengajuan otomatis saat resep READY */}
        <div className={cardCls}>
          <h2 className="mb-4 text-sm font-semibold text-slate-900">Jadwal Minum Berulang (opsional)</h2>
          <div className="space-y-3">
            <div className="flex items-end gap-2">
              <div className="w-32">
                <label htmlFor="doseTime" className={labelCls}>
                  Jam minum
                </label>
                <input
                  id="doseTime"
                  type="time"
                  value={doseTime}
                  onChange={(e) => setDoseTime(e.target.value)}
                  className={inputCls}
                />
              </div>
              <button
                type="button"
                onClick={addDoseTime}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
              >
                <Plus className="h-3.5 w-3.5" />
                Tambah Jam
              </button>
            </div>
            <input type="hidden" name="doseTimes-json" value={JSON.stringify(doseTimes)} />
            {doseTimes.length > 0 && (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  {doseTimes.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700"
                    >
                      <Clock className="h-3 w-3" />
                      {t}
                      <button
                        type="button"
                        onClick={() => removeDoseTime(t)}
                        aria-label={`Hapus jam ${t}`}
                        className="ml-0.5 text-teal-400 transition hover:text-rose-600"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className={labelCls}>Pengulangan jadwal minum</label>
                    <Select
                      name="repeatMode"
                      ariaLabel="Pengulangan jadwal minum"
                      value={repeatMode}
                      onChange={setRepeatMode}
                      options={[
                        { value: "DAILY", label: "Setiap hari" },
                        { value: "INTERVAL", label: "Setiap beberapa hari (interval)" },
                      ]}
                    />
                  </div>
                  {repeatMode === "INTERVAL" && (
                    <div>
                      <label htmlFor="intervalDays" className={labelCls}>
                        Interval (hari) <span className="text-rose-500">*</span>
                      </label>
                      <input
                        id="intervalDays"
                        name="intervalDays"
                        type="number"
                        min={1}
                        max={30}
                        value={intervalDays}
                        onChange={(e) => setIntervalDays(e.target.value)}
                        className={inputCls}
                      />
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="button" onClick={handleConfirmSubmit}
            id="btn-submit-resep"
            disabled={isPending}
            className={btnPrimary}
          >
            {isPending ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Menyimpan…
              </>
            ) : (
              "Ajukan Resep"
            )}
          </button>
          <Link
            href="/resep"
            className={btnSecondary}
          >
            Batal
          </Link>
        </div>
      </form>
    </div>
  );
}
