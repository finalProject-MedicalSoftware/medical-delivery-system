"use client";

import { useState, useTransition } from "react";
import {
  addBedAction,
  toggleBedAction,
  deleteBedAction,
} from "@/app/actions/wards";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/Confirm";
import { Plus, X } from "lucide-react";

interface Bed {
  id: string;
  bedNumber: string;
  isOccupied: boolean;
  occupantName?: string | null;
}

/**
 * Kelola tempat tidur dalam satu ruang: tambah, tandai huni/kosong, hapus.
 * Klik chip untuk mengubah status hunian; × untuk menghapus.
 */
export default function BedManager({
  roomId,
  beds,
}: {
  roomId: string;
  beds: Bed[];
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [number, setNumber] = useState("");
  const toast = useToast();
  const confirm = useConfirm();

  function run(
    action: Promise<{ success: boolean; error?: string }>,
    successMessage: string,
    reset?: () => void
  ) {
    setError(null);
    startTransition(async () => {
      const res = await action;
      if (res.success) {
        toast.success(successMessage);
        reset?.();
      } else {
        setError(res.error ?? "Gagal memproses bed");
      }
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {beds.length === 0 && (
          <span className="text-[11px] text-slate-400">Belum ada bed</span>
        )}
        {beds.map((bed) => (
          <span
            key={bed.id}
            title={
              bed.occupantName
                ? `Ditempati ${bed.occupantName} - ubah via menu Pasien`
                : bed.isOccupied
                  ? "Dihuni (tanpa tautan pasien)"
                  : "Kosong"
            }
            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold ${
              bed.isOccupied || bed.occupantName
                ? "bg-rose-100 text-rose-700"
                : "bg-emerald-100 text-emerald-800"
            }`}
          >
            <button
              type="button"
              disabled={isPending}
              title={bed.isOccupied ? "Tandai kosong" : "Tandai dihuni"}
              onClick={() =>
                run(
                  toggleBedAction(bed.id),
                  bed.isOccupied
                    ? `Bed ${bed.bedNumber} ditandai kosong`
                    : `Bed ${bed.bedNumber} ditandai dihuni`
                )
              }
              className="rounded px-0.5 font-semibold hover:underline disabled:opacity-50"
            >
              {bed.bedNumber}
            </button>
            <button
              type="button"
              disabled={isPending}
              title={`Hapus bed ${bed.bedNumber}`}
              aria-label={`Hapus bed ${bed.bedNumber}`}
              onClick={async () => {
                const ok = await confirm({
                  title: "Hapus bed",
                  message: `Hapus bed ${bed.bedNumber} dari ruang ini?`,
                  danger: true,
                });
                if (ok) run(deleteBedAction(bed.id), `Bed ${bed.bedNumber} dihapus`);
              }}
              className="rounded p-0.5 opacity-60 transition hover:opacity-100 disabled:opacity-50"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        <input
          value={number}
          disabled={isPending}
          onChange={(e) => setNumber(e.target.value)}
          placeholder="No. bed…"
          aria-label="Nomor bed baru"
          className="w-24 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 placeholder-slate-400 focus:border-teal-600 focus:outline-none disabled:opacity-50"
        />
        <button
          type="button"
          disabled={isPending || !number.trim()}
          title="Tambah bed"
          aria-label="Tambah bed"
          onClick={() =>
            run(addBedAction(roomId, number), `Bed ${number.trim().toUpperCase()} ditambah`, () =>
              setNumber("")
            )
          }
          className="rounded-md border border-slate-300 p-1.5 text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {isPending && <p className="text-[11px] text-slate-400">Memproses…</p>}
      {error && <p className="text-[11px] text-rose-600">{error}</p>}
    </div>
  );
}
