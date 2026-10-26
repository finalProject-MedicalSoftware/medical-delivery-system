"use client";

import { useTransition, useState } from "react";
import { advanceDeliveryStatusAction } from "@/app/actions/delivery";
import { UserAuthContext } from "@/lib/rbac";
import { DeliveryStatus } from "@prisma/client";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { cardCls } from "@/components/ui";
import { useToast } from "@/components/Toast";

interface Props {
  delivery: { id: string; status: DeliveryStatus };
  user: UserAuthContext;
}

const TRANSITIONS: Partial<Record<DeliveryStatus, { to: DeliveryStatus; label: string; cls: string }>> = {
  DELIVERY_REQUESTED: {
    to: "PENDING_INTEGRATION",
    label: "Tandai Pending Integrasi",
    cls: "bg-amber-100 text-amber-800 ring-amber-200 hover:bg-amber-200",
  },
  PENDING_INTEGRATION: {
    to: "MOCK_IN_TRANSIT",
    label: "[MOCK] Simulasi Dalam Perjalanan",
    cls: "bg-sky-100 text-sky-800 ring-sky-200 hover:bg-sky-200",
  },
  MOCK_IN_TRANSIT: {
    to: "MOCK_ARRIVED_AT_ROOM",
    label: "[MOCK] Simulasi Tiba di Ruang",
    cls: "bg-emerald-100 text-emerald-800 ring-emerald-200 hover:bg-emerald-200",
  },
};

export default function DeliveryStatusActions({ delivery, user }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const next = TRANSITIONS[delivery.status];
  const canAct =
    user.roles.includes("SYSTEM_ADMIN") ||
    user.permissions.includes("delivery:create");

  if (!next || !canAct) return null;

  function handleAdvance() {
    setError(null);
    startTransition(async () => {
      const result = await advanceDeliveryStatusAction(delivery.id, next!.to);
      if (result.success) {
        toast.success("Status pengantaran diperbarui");
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

      {next.to.startsWith("MOCK_") && (
        <p className="mt-3 text-xs text-slate-400">
          ⚠ Tindakan ini adalah simulasi demo. Tidak terhubung ke robot atau sistem eksternal nyata.
        </p>
      )}
    </div>
  );
}
