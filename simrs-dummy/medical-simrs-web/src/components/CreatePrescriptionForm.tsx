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
import { findAllergyConflicts, HANDLING_LABELS, PRIORITY_LABELS } from "@/lib/clinical";
import { buildInstructions, MEAL_TIMING_LABELS, ROUTE_LABELS, validateDose, type MealTiming, type Route } from "@/lib/dosage";
import { inputCls, labelCls, cardCls, btnPrimary, btnSecondary } from "@/components/ui";

interface Patient {
  id: string;
  fullName: string;
  mrn: string;
  roomCode: string | null;
  diagnosis: string | null;
  isInfectious: boolean;
  allergies: string[];
  bed: { bedNumber: string } | null;
}
interface Medicine {
  id: string;
  name: string;
  code: string;
  unit: string;
  stock: number;
  handling: string;
}
interface PrescriptionItem {
  medicineId: string;
  quantity: number; // jumlah total yang diserahkan
  doseAmount: number; // per sekali pakai
  doseUnit: string; // kosong = satuan obat
  timesPerDay: number;
  mealTiming: MealTiming;
  durationDays: number | null;
  adminRoute: Route;
  doseNote: string;
}

const newItem = (): PrescriptionItem => ({
  medicineId: "", quantity: 1, doseAmount: 1, doseUnit: "", timesPerDay: 3,
  mealTiming: "AFTER_MEAL", durationDays: null, adminRoute: "ORAL", doseNote: "",
});

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
  const [items, setItems] = useState<PrescriptionItem[]>([newItem()]);
  const [allergyAck, setAllergyAck] = useState(false);
  const conflicts = findAllergyConflicts(
    selectedPatient?.allergies ?? [],
    items.map((i) => medicines.find((m) => m.id === i.medicineId)).filter((m): m is Medicine => !!m)
  );
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
    setItems((prev) => [...prev, newItem()]);
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateItem<K extends keyof PrescriptionItem>(idx: number, field: K, value: PrescriptionItem[K]) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  }

  const doseOf = (it: PrescriptionItem) => ({
    amount: it.doseAmount, unit: it.doseUnit.trim() || medicines.find((m) => m.id === it.medicineId)?.unit || "",
    timesPerDay: it.timesPerDay, mealTiming: it.mealTiming, durationDays: it.durationDays,
    route: it.adminRoute, note: it.doseNote || null,
  });

  async function handleConfirmSubmit() {
    for (const [i, it] of items.entries()) {
      const bad = !it.medicineId ? "Pilih obat" : validateDose(doseOf(it));
      if (bad) { setError(`Obat #${i + 1}: ${bad}`); return; }
    }
    if (conflicts.length > 0 && !allergyAck) {
      setError("Ada peringatan alergi. Centang pernyataan risiko untuk melanjutkan.");
      return;
    }
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
          Buat Resep
        </h1>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {conflicts.length > 0 && (
        <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4" />
            Peringatan alergi
          </p>
          <ul className="mt-1 list-disc pl-6">
            {conflicts.map((c) => (
              <li key={c.medicine}>{c.medicine} - pasien alergi {c.allergy}</li>
            ))}
          </ul>
          <label className="mt-3 flex items-center gap-2">
            <input type="checkbox" checked={allergyAck} onChange={(e) => setAllergyAck(e.target.checked)} className="h-4 w-4 accent-amber-700" />
            Saya sudah menilai risiko dan tetap meresepkan.
          </label>
        </div>
      )}

      <form ref={formRef} onSubmit={(e) => e.preventDefault()} className="space-y-5">
        <input type="hidden" name="allergyAck" value={allergyAck ? "1" : "0"} />
        <input type="hidden" id="items-json" name="items" value={JSON.stringify(items.map((it) => ({ ...it, doseUnit: doseOf(it).unit, doseNote: it.doseNote || null })))} />

        {/* Patient selection */}
        <div className={cardCls}>
          <h2 className="mb-4 text-sm font-semibold text-slate-900">Data Pasien & Catatan</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="patientId" className={labelCls}>
                Pasien <span className="text-rose-500">*</span>
              </label>
              <Select
                name="patientId"
                ariaLabel="Pasien"
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
                  {selectedPatient.allergies.length > 0 && (
                    <p className="mt-1 flex items-center gap-1 font-semibold text-amber-800">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Alergi: {selectedPatient.allergies.join(", ")}
                    </p>
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
              <label htmlFor="priority" className={labelCls}>Prioritas</label>
              <select id="priority" name="priority" defaultValue="ROUTINE" className={inputCls}>
                {Object.entries(PRIORITY_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
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
                        label: `${m.name} (${m.unit}) - stok: ${m.stock}${m.handling !== "NONE" ? ` · ${HANDLING_LABELS[m.handling as keyof typeof HANDLING_LABELS]}` : ""}`,
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
                </div>

                <fieldset className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
                  <legend className="px-1 text-xs font-semibold text-slate-600">Aturan pakai</legend>
                  <div className="grid gap-3 md:grid-cols-4">
                    <div>
                      <label className="mb-1 block text-xs text-slate-500">Jumlah per dosis</label>
                      <input type="number" min={0.25} step={0.25} value={item.doseAmount}
                        onChange={(e) => updateItem(idx, "doseAmount", parseFloat(e.target.value))} className={inputCls} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-slate-500">Satuan</label>
                      <input type="text" value={item.doseUnit} placeholder={medicines.find((m) => m.id === item.medicineId)?.unit ?? "tablet"}
                        onChange={(e) => updateItem(idx, "doseUnit", e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-slate-500">Kali sehari</label>
                      <input type="number" min={1} max={6} value={item.timesPerDay}
                        onChange={(e) => updateItem(idx, "timesPerDay", parseInt(e.target.value))} className={inputCls} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-slate-500">Lama (hari, opsional)</label>
                      <input type="number" min={1} max={90} value={item.durationDays ?? ""}
                        onChange={(e) => updateItem(idx, "durationDays", e.target.value === "" ? null : parseInt(e.target.value))} className={inputCls} />
                    </div>
                    <div className="md:col-span-2">
                      <label className="mb-1 block text-xs text-slate-500">Waktu terhadap makan</label>
                      <select value={item.mealTiming} onChange={(e) => updateItem(idx, "mealTiming", e.target.value as MealTiming)} className={inputCls}>
                        {Object.entries(MEAL_TIMING_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <label className="mb-1 block text-xs text-slate-500">Cara pemakaian</label>
                      <select value={item.adminRoute} onChange={(e) => updateItem(idx, "adminRoute", e.target.value as Route)} className={inputCls}>
                        {Object.entries(ROUTE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </div>
                    <div className="md:col-span-4">
                      <label className="mb-1 block text-xs text-slate-500">Catatan (opsional)</label>
                      <input type="text" maxLength={150} value={item.doseNote} placeholder="cth: bila demam"
                        onChange={(e) => updateItem(idx, "doseNote", e.target.value)} className={inputCls} />
                    </div>
                  </div>
                  <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700" aria-live="polite">
                    {validateDose(doseOf(item)) ? "Lengkapi aturan pakai." : buildInstructions(doseOf(item))}
                  </p>
                </fieldset>
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
