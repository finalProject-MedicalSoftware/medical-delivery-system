"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  dischargePatientAction,
  readmitPatientAction,
} from "@/app/actions/patients";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/Confirm";
import { CheckCircle2, RotateCcw, Stethoscope, FileText } from "lucide-react";
import { inputCls, labelCls } from "@/components/ui";

interface DischargeInfo {
  at: string;
  note: string | null;
}

/**
 * Panel keluar-masuk perawatan pada detail pasien.
 * - Ada ruang (rawat inap): form selesaikan rawat inap.
 * - Tanpa ruang (tidak rawat inap): alert untuk perawat/dokter +
 *   CTA buat resep + tandai kunjungan selesai agar masuk riwayat.
 */
export default function DischargePanel({
  patientId,
  roomCode,
  canCreateRx,
  discharged,
}: {
  patientId: string;
  roomCode: string | null;
  canCreateRx: boolean;
  discharged: DischargeInfo | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const toast = useToast();
  const confirm = useConfirm();

  const isInpatient = !!roomCode && !discharged;

  function handleDischarge(fallbackNote: string, successTitle: string) {
    (async () => {
      // Konfirmasi di LUAR transition agar dialog langsung tampil.
      const ok = await confirm({
        title: "Selesaikan perawatan?",
        message:
          "Pasien dipindah ke riwayat dan tidak lagi dihitung sebagai pasien dirawat. Lanjutkan?",
        confirmLabel: "Ya, selesaikan",
      });
      if (!ok) return;
      setError(null);
      startTransition(async () => {
        const finalNote = note.trim() || fallbackNote;
        const res = await dischargePatientAction(patientId, finalNote);
        if (res.success) {
          toast.success(successTitle, {
            description: "Pasien dipindah ke riwayat.",
          });
          setNote("");
        } else {
          setError(res.error ?? "Gagal menyelesaikan perawatan");
        }
      });
    })();
  }

  function handleReadmit() {
    (async () => {
      const ok = await confirm({
        title: "Rawat kembali",
        message: "Pasien kembali dihitung sebagai pasien dirawat. Lanjutkan?",
        confirmLabel: "Ya, rawat kembali",
      });
      if (!ok) return;
      setError(null);
      startTransition(async () => {
        const res = await readmitPatientAction(patientId);
        if (res.success) {
          toast.success("Pasien dirawat kembali");
        } else {
          setError(res.error ?? "Gagal merawat kembali");
        }
      });
    })();
  }

  if (discharged) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
          <CheckCircle2 className="h-4 w-4 text-slate-500" />
          Perawatan selesai (riwayat)
        </h2>
        <p className="text-xs text-slate-500">
          Selesai: {new Date(discharged.at).toLocaleString("id-ID")}
          {discharged.note ? ` - ${discharged.note}` : ""}
        </p>
        {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
        <button
          type="button"
          onClick={handleReadmit}
          disabled={isPending}
          className="mt-3 inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
        >
          <RotateCcw className="h-4 w-4" />
          {isPending ? "Memproses…" : "Rawat kembali"}
        </button>
      </div>
    );
  }

  if (!isInpatient) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-900">
          <Stethoscope className="h-4 w-4" />
          Pasien belum rawat inap
        </h2>
        <p className="text-xs leading-relaxed text-amber-800">
          Pasien ini tidak memiliki ruang rawat. Minta perawat atau dokter
          untuk memeriksa pasien, atau buatkan resep obat agar ada tindak lanjut
          tercatat. Tandai kunjungan selesai agar pasien masuk ke riwayat.
        </p>
        {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          {canCreateRx && (
            <Link
              href={`/resep/baru?patient=${patientId}`}
              className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800"
            >
              <FileText className="h-4 w-4" />
              Buatkan resep
            </Link>
          )}
          <button
            type="button"
            onClick={() => handleDischarge("Kunjungan rawat jalan selesai", "Kunjungan selesai")}
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-800 transition hover:bg-amber-100 disabled:opacity-60"
          >
            <CheckCircle2 className="h-4 w-4" />
            {isPending ? "Memproses…" : "Tandai kunjungan selesai"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="mb-3 text-sm font-semibold text-slate-900">Selesaikan rawat inap</h2>
      <label htmlFor="discharge-note" className={labelCls}>
        Catatan pulang (opsional)
      </label>
      <textarea
        id="discharge-note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="cth: Pulang atas izin dokter…"
        className={inputCls}
      />
      {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
      <button
        type="button"
        onClick={() => handleDischarge(note, "Rawat inap diselesaikan")}
        disabled={isPending}
        className="mt-3 inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
      >
        <CheckCircle2 className="h-4 w-4" />
        {isPending ? "Memproses…" : "Selesaikan rawat inap"}
      </button>
    </div>
  );
}
