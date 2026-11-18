"use client";

import { useConfirm } from "@/components/Confirm";
import { useTransition, useState } from "react";
import { advanceDeliveryStatusAction } from "@/app/actions/delivery";
import { UserAuthContext } from "@/lib/rbac";
import { DeliveryStatus } from "@prisma/client";
import Link from "next/link";
import { AlertTriangle, ChevronRight, QrCode, BedDouble } from "lucide-react";
import { cardCls } from "@/components/ui";
import { useToast } from "@/components/Toast";

interface Props {
  delivery: { id: string; status: DeliveryStatus };
  user: UserAuthContext;
  /** Tautan QR bertoken ke /scan/{mrn} — satu-satunya jalur serah-terima. */
  scanHref: string;
  /** Halaman pasien (ada aksi "Selesaikan rawat inap"). */
  patientHref: string;
}

const TRANSITIONS: Partial<Record<DeliveryStatus, { to: DeliveryStatus; label: string; cls: string }>> = {
  DELIVERY_REQUESTED: {
    to: "PENDING_INTEGRATION",
    label: "Kirim ke Robot",
    cls: "bg-amber-100 text-amber-800 ring-amber-200 hover:bg-amber-200",
  },
  PENDING_INTEGRATION: {
    to: "IN_TRANSIT",
    label: "Tandai Dalam Perjalanan",
    cls: "bg-sky-100 text-sky-800 ring-sky-200 hover:bg-sky-200",
  },
  IN_TRANSIT: {
    to: "ARRIVED_AT_ROOM",
    label: "Tandai Tiba di Ruangan",
    cls: "bg-emerald-100 text-emerald-800 ring-emerald-200 hover:bg-emerald-200",
  },
};

export default function DeliveryStatusActions({ delivery, user, scanHref, patientHref }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const confirm = useConfirm();

  const next = TRANSITIONS[delivery.status];
  const notYetSent = delivery.status === "DELIVERY_REQUESTED";
  const canAct =
    user.roles.includes("SYSTEM_ADMIN") ||
    user.permissions.includes("delivery:create");

  if (!canAct) return null;

  // Sudah tiba: serah-terima HANYA lewat scan QR, jadi tidak ada tombol
  // transisi di sini. Yang ditawarkan hanya jalan keluar yang sah.
  if (!next && delivery.status === "ARRIVED_AT_ROOM") {
    return (
      <div className={cardCls}>
        <h2 className="mb-4 text-sm font-semibold text-slate-900">Tindakan</h2>
        <p className="mb-4 text-sm text-slate-600">
          Robot sudah tiba. Serah-terima hanya bisa dikonfirmasi lewat scan QR gelang pasien.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href={scanHref} className="inline-flex items-center gap-2 rounded-lg bg-emerald-100 px-4 py-2 text-sm font-medium text-emerald-800 ring-1 ring-emerald-200 transition hover:bg-emerald-200">
            <QrCode className="h-4 w-4" />
            Buka Scan QR Pasien
          </Link>
          <Link href={patientHref} className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-slate-600 ring-1 ring-slate-300 transition hover:bg-slate-100">
            <BedDouble className="h-4 w-4" />
            Selesaikan Rawat Inap
          </Link>
        </div>
        <p className="mt-3 text-xs text-slate-400">
          Pengantaran ulang memerlukan resep baru; resep ini tidak bisa diajukan lagi selama pengantaran aktif.
        </p>
      </div>
    );
  }

  if (!next) return null;

  async function handleAdvance() {
    setError(null);
    if (notYetSent) {
      const ok = await confirm({
        title: "Kirim ke robot?",
        message: "Pengantaran ini akan masuk ke web monitoring sebagai misi untuk robot. Pastikan obat sudah siap.",
        confirmLabel: "Kirim ke Robot",
      });
      if (!ok) return;
    }
    startTransition(async () => {
      const result = await advanceDeliveryStatusAction(delivery.id, next!.to);
      if (result.success) {
        toast.success(notYetSent ? "Dikirim ke robot - kini terlihat di web monitoring" : "Status pengantaran diperbarui");
      } else {
        setError(result.error ?? "Gagal mengubah status");
      }
    });
  }

  function handleCancel() {
    setError(null);
    startTransition(async () => {
      const result = await advanceDeliveryStatusAction(delivery.id, "CANCELLED", "Dibatalkan oleh pengguna");
      if (result.success) {
        toast.success("Pengantaran dibatalkan");
      } else {
        setError(result.error ?? "Gagal membatalkan");
      }
    });
  }

  return (
    <div className={cardCls}>
      <h2 className="mb-4 text-sm font-semibold text-slate-900">Tindakan</h2>

      {notYetSent && (
        <p className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          Pengantaran ini baru tersimpan di SIMRS dan <strong>belum terlihat di web monitoring</strong>. Tekan
          <strong> Kirim ke Robot</strong> untuk memasukkannya sebagai misi.
        </p>
      )}

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleAdvance}
          disabled={isPending}
          id="btn-advance-status"
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ring-1 transition disabled:opacity-60 ${next.cls}`}
        >
          {isPending ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          {next.label}
        </button>

        {delivery.status !== "CANCELLED" && (
          <button
            onClick={handleCancel}
            disabled={isPending}
            id="btn-cancel-delivery"
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-500 ring-1 ring-slate-300 transition hover:bg-slate-100 disabled:opacity-60"
          >
            Batalkan Pengantaran
          </button>
        )}
      </div>

    </div>
  );
}
