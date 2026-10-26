"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { updatePrescriptionStatusAction, verifyPrescriptionAction } from "@/app/actions/prescriptions";
import { UserAuthContext } from "@/lib/rbac";
import { PrescriptionStatus } from "@prisma/client";
import { CheckCircle2, XCircle, PackageCheck, Truck, AlertTriangle } from "lucide-react";
import { cardCls, inputCls } from "@/components/ui";
import { useToast } from "@/components/Toast";

interface Rx {
  id: string;
  status: PrescriptionStatus;
}

interface Props {
  rx: Rx;
  user: UserAuthContext;
}

export default function PrescriptionActions({ rx, user }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const toast = useToast();
  const router = useRouter();

  const isAdmin = user.roles.includes("SYSTEM_ADMIN");
  const canVerify = isAdmin || user.permissions.includes("prescription:verify");
  const canPrepare = isAdmin || user.permissions.includes("prescription:prepare");
  const canCreate = isAdmin || user.permissions.includes("prescription:create");

  function handleStatusChange(newStatus: PrescriptionStatus) {    const messages: Partial<Record<PrescriptionStatus, string>> = {
      PREPARING: "Penyiapan obat dimulai",
      READY_FOR_DELIVERY: "Resep ditandai siap kirim",
      CANCELLED: "Resep dibatalkan",
    };
    setError(null);
    startTransition(async () => {
      const result = await updatePrescriptionStatusAction(rx.id, newStatus);
      if (result.success) {
        toast.success(messages[newStatus] ?? "Status resep diperbarui");
      } else {
        setError(result.error ?? "Gagal mengubah status");
      }
    });
  }

  function handleVerify(v: "VERIFY" | "REJECT", rejectionReason?: string) {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("prescriptionId", rx.id);
      fd.set("action", v);
      if (rejectionReason) fd.set("rejectionReason", rejectionReason);
      const res = await verifyPrescriptionAction(fd);
      if (res.ok) {
        toast.success(v === "VERIFY" ? "Resep diverifikasi" : "Resep ditolak");
        setShowRejectForm(false);
        setRejectReason("");
        router.refresh();
      } else {
        setError(res.error ?? "Gagal memproses verifikasi");
      }
    });
  }

  return (
    <div className={cardCls}>
      <h2 className="mb-4 text-sm font-semibold text-slate-900">Tindakan</h2>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {/* Pharmacist: Verify or Reject (SUBMITTED → VERIFIED/REJECTED) */}
        {rx.status === "SUBMITTED" && canVerify && (
          <>
            <button
              type="button"
              onClick={() => handleVerify("VERIFY")}
              disabled={isPending}
              id="btn-verify"
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-100 px-4 py-2 text-sm font-medium text-emerald-800 ring-1 ring-emerald-200 transition hover:bg-emerald-200 disabled:opacity-60"
            >
              <CheckCircle2 className="h-4 w-4" />
              Verifikasi
            </button>
            <button
              onClick={() => setShowRejectForm((v) => !v)}
              id="btn-show-reject"
              className="inline-flex items-center gap-2 rounded-lg bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 ring-1 ring-rose-200 transition hover:bg-rose-100"
            >
              <XCircle className="h-4 w-4" />
              Tolak
            </button>
          </>
        )}

        {/* Pharmacy staff: VERIFIED → PREPARING */}
        {rx.status === "VERIFIED" && canPrepare && (
          <button
            onClick={() => handleStatusChange("PREPARING")}
            disabled={isPending}
            id="btn-preparing"
            className="inline-flex items-center gap-2 rounded-lg bg-amber-100 px-4 py-2 text-sm font-medium text-amber-800 ring-1 ring-amber-200 transition hover:bg-amber-200 disabled:opacity-60"
          >
            <PackageCheck className="h-4 w-4" />
            Mulai Persiapan
          </button>
        )}

        {/* Pharmacy staff: PREPARING → READY_FOR_DELIVERY */}
        {rx.status === "PREPARING" && canPrepare && (
          <button
            onClick={() => handleStatusChange("READY_FOR_DELIVERY")}
            disabled={isPending}
            id="btn-ready"
            className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-800 disabled:opacity-60"
          >
            <Truck className="h-4 w-4" />
            Tandai Siap Kirim
          </button>
        )}

        {/* Cancel (for non-terminal status) */}
        {!["CANCELLED", "REJECTED", "READY_FOR_DELIVERY"].includes(rx.status) && canCreate && (
          <button
            onClick={() => handleStatusChange("CANCELLED")}
            disabled={isPending}
            id="btn-cancel"
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-slate-500 ring-1 ring-slate-300 transition hover:bg-slate-100 disabled:opacity-60"
          >
            Batalkan
          </button>
        )}

        {isPending && (
          <span className="flex items-center gap-2 text-sm text-slate-500">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
            Memproses…
          </span>
        )}
      </div>

      {/* Reject form */}
      {showRejectForm && rx.status === "SUBMITTED" && canVerify && (
        <div className="mt-4 space-y-3 rounded-lg border border-rose-200 bg-rose-50 p-4">
          <label className="block text-sm font-medium text-rose-800">
            Alasan Penolakan <span className="text-rose-500">*</span>
          </label>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
            placeholder="Tulis alasan penolakan resep…"
            className={`${inputCls} border-rose-200 focus:border-rose-400 focus:ring-rose-400`}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleVerify("REJECT", rejectReason)}
              disabled={isPending || !rejectReason.trim()}
              id="btn-confirm-reject"
              className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-60"
            >
              Konfirmasi Tolak
            </button>
            <button
              type="button"
              onClick={() => setShowRejectForm(false)}
              className="rounded-lg px-4 py-2 text-sm text-slate-500 hover:bg-white"
            >
              Batal
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
