"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPatientAction, updatePatientAction } from "@/app/actions/patients";
import { useToast } from "@/components/Toast";
import Link from "next/link";
import { ArrowLeft, Users, AlertTriangle, Biohazard } from "lucide-react";
import { inputCls, labelCls, cardCls, btnPrimary, btnSecondary } from "@/components/ui";
import { useConfirm } from "@/components/Confirm";
import Select from "@/components/Select";

import type { RoomAvailability } from "@/lib/bed-info";

export interface PatientInitial {
  id: string;
  mrn: string;
  fullName: string;
  dateOfBirth: string;
  gender: string;
  roomCode: string | null;
  bedId: string | null;
  notes: string | null;
  diagnosis: string | null;
  isInfectious: boolean;
}

export default function PatientForm({
  rooms,
  initial,
}: {
  rooms: RoomAvailability[];
  initial?: PatientInitial;
}) {
  const isEdit = !!initial;
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [roomCode, setRoomCode] = useState(initial?.roomCode ?? "");
  const [bedId, setBedId] = useState(initial?.bedId ?? "");
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const saveAction = isEdit ? updatePatientAction : createPatientAction;

  async function handleConfirmSubmit() {
    const ok = await confirm({
      title: isEdit ? "Simpan perubahan?" : "Simpan pasien baru?",
      message: isEdit
        ? "Perubahan data pasien akan dicatat di audit trail."
        : "Data pasien sintetis baru akan ditambahkan.",
      confirmLabel: "Simpan",
    });
    if (!ok || !formRef.current) return;
    const fd = new FormData(formRef.current);
    setError(null);
    startTransition(async () => {
      const res = await saveAction(fd);
      if (res.ok) {
        window.setTimeout(() => toast.success(isEdit ? "Perubahan pasien tersimpan" : "Data pasien tersimpan"), 400);
        router.push(res.to ?? "/pasien");
      } else {
        setError(res.error ?? "Gagal menyimpan pasien");
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link
          href={isEdit ? `/pasien/${initial.id}` : "/pasien"}
          className="text-slate-400 transition hover:text-slate-700"
          aria-label="Kembali"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <Users className="h-5 w-5 text-teal-700" />
            {isEdit ? "Ubah Pasien Sintetis" : "Tambah Pasien Sintetis"}
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Data fiktif untuk demonstrasi - jangan masukkan identitas orang nyata
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <form ref={formRef} onSubmit={(e) => e.preventDefault()} className="space-y-5">
        {isEdit && <input type="hidden" name="patientId" value={initial.id} />}

        <div className={cardCls}>
          <h2 className="mb-4 text-sm font-semibold text-slate-900">Data Pasien</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="mrn" className={labelCls}>
                Nomor MRN <span className="text-rose-500">*</span>
              </label>
              <input
                id="mrn"
                name="mrn"
                type="text"
                required
                minLength={3}
                defaultValue={initial?.mrn}
                placeholder="cth: MRN-000123"
                autoComplete="off"
                className={`${inputCls} font-mono`}
              />
            </div>
            <div>
              <label htmlFor="fullName" className={labelCls}>
                Nama Lengkap <span className="text-rose-500">*</span>
              </label>
              <input
                id="fullName"
                name="fullName"
                type="text"
                required
                minLength={2}
                defaultValue={initial?.fullName}
                placeholder="cth: Budi Santoso (fiktif)"
                autoComplete="off"
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="dateOfBirth" className={labelCls}>
                Tanggal Lahir <span className="text-rose-500">*</span>
              </label>
              <input
                id="dateOfBirth"
                name="dateOfBirth"
                type="date"
                required
                defaultValue={initial?.dateOfBirth}
                className={inputCls}
              />
            </div>
            <div>
              <span id="gender-label" className={labelCls}>
                Gender <span className="text-rose-500">*</span>
              </span>
              <Select
                name="gender"
                ariaLabel="Gender"
                placeholder="- Pilih Gender -"
                defaultValue={initial?.gender ?? ""}
                options={[
                  { value: "L", label: "Laki-laki" },
                  { value: "P", label: "Perempuan" },
                ]}
              />
            </div>
            <div>
              <span id="room-label" className={labelCls}>
                Ruang Rawat (opsional)
              </span>
              <Select
                name="roomCode"
                ariaLabel="Ruang rawat"
                placeholder="- Tanpa ruang -"
                value={roomCode}
                onChange={(v) => {
                  setRoomCode(v);
                  setBedId("");
                }}
                options={rooms.map((r) => ({
                  value: r.roomCode,
                  label:
                    `${r.roomCode} - ${r.name} (${r.wardName}) · ${r.freeCount} bed bebas` +
                    (r.freeCount === 0 ? " · Penuh" : ""),
                }))}
              />
              <p className="mt-1 text-[11px] text-slate-400">
                Hanya ruang dengan bed bebas yang tampil. Data hunian dibaca live dari database.
              </p>
            </div>
            <div>
              <span id="bed-label" className={labelCls}>
                Bed {roomCode ? <span className="text-rose-500">*</span> : "(opsional)"}
              </span>
              <Select
                name="bedId"
                ariaLabel="Bed"
                placeholder={roomCode ? "- Pilih Bed -" : "- Pilih ruang dulu -"}
                disabled={!roomCode}
                required={!!roomCode}
                value={bedId}
                onChange={setBedId}
                options={(rooms.find((r) => r.roomCode === roomCode)?.beds ?? []).map((b) => {
                  const own =
                    initial?.bedId === b.id && initial?.roomCode === roomCode;
                  return {
                    value: b.id,
                    label:
                      `Bed ${b.bedNumber}` +
                      (!b.free && !own
                        ? ` · Terisi${b.occupantName ? ` (${b.occupantName})` : ""}`
                        : ""),
                    disabled: !b.free && !own,
                  };
                })}
              />
            </div>
            <div>
              <label htmlFor="notes" className={labelCls}>
                Catatan (opsional)
              </label>
              <input
                id="notes"
                name="notes"
                type="text"
                defaultValue={initial?.notes ?? ""}
                placeholder="Catatan tambahan…"
                autoComplete="off"
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="diagnosis" className={labelCls}>
                Diagnosis / Penyakit (opsional)
              </label>
              <input
                id="diagnosis"
                name="diagnosis"
                type="text"
                defaultValue={initial?.diagnosis ?? ""}
                placeholder="cth: Demam Berdarah (fiktif)"
                autoComplete="off"
                className={inputCls}
              />
            </div>
            <div className="flex items-end pb-1">
              <label
                htmlFor="isInfectious"
                className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <input
                  id="isInfectious"
                  name="isInfectious"
                  type="checkbox"
                  value="1"
                  defaultChecked={initial?.isInfectious ?? false}
                  className="h-4 w-4 rounded border-slate-300 accent-rose-600"
                />
                <span className="flex items-center gap-1.5 font-medium text-slate-700">
                  <Biohazard className="h-4 w-4 text-rose-600" />
                  Penyakit menular (ALERT)
                </span>
              </label>
            </div>
          </div>
          <p className="mt-3 text-[11px] text-slate-400">
            Pasien menular ditandai ALERT infeksi dan ikut dilempar ke website monitoring.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            type="button" onClick={handleConfirmSubmit}
            disabled={isPending}
            className={btnPrimary}
          >
            {isPending ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Menyimpan…
              </>
            ) : isEdit ? (
              "Simpan Perubahan"
            ) : (
              "Simpan Pasien"
            )}
          </button>
          <Link
            href={isEdit ? `/pasien/${initial.id}` : "/pasien"}
            className={btnSecondary}
          >
            Batal
          </Link>
        </div>
      </form>
    </div>
  );
}
