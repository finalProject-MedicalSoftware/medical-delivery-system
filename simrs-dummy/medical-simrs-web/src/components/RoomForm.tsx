"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createRoomAction, updateRoomAction } from "@/app/actions/wards";
import { useConfirm } from "@/components/Confirm";
import { useToast } from "@/components/Toast";
import Link from "next/link";
import { ArrowLeft, BedDouble, AlertTriangle } from "lucide-react";
import { inputCls, labelCls, cardCls, btnPrimary, btnSecondary } from "@/components/ui";
import Select from "@/components/Select";

interface Ward {
  id: string;
  code: string;
  name: string;
}

export interface RoomInitial {
  id: string;
  roomCode: string;
  name: string;
  wardId: string;
}

export default function RoomForm({
  wards,
  initial,
  presetWardId,
}: {
  wards: Ward[];
  initial?: RoomInitial;
  presetWardId?: string;
}) {
  const isEdit = !!initial;
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const saveAction = isEdit ? updateRoomAction : createRoomAction;
  const confirm = useConfirm();
  const formRef = useRef<HTMLFormElement>(null);

  async function handleConfirmSubmit() {
    const ok = await confirm({
      title: isEdit ? "Simpan perubahan?" : "Simpan ruang baru?",
      message: isEdit
        ? "Perubahan ruang akan dicatat di audit trail."
        : "Ruang rawat baru akan ditambahkan.",
      confirmLabel: "Simpan",
    });
    if (!ok || !formRef.current) return;
    const fd = new FormData(formRef.current);
    setError(null);
    startTransition(async () => {
      const res = await saveAction(fd);
      if (res.ok) {
        window.setTimeout(() => toast.success(isEdit ? "Perubahan ruang tersimpan" : "Ruang tersimpan"), 400);
        router.push(res.to ?? "/bangsal");
      } else {
        setError(res.error ?? "Gagal menyimpan ruang");
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link
          href="/bangsal"
          className="text-slate-400 transition hover:text-slate-700"
          aria-label="Kembali"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <BedDouble className="h-5 w-5 text-teal-700" />
            {isEdit ? "Ubah Ruang Rawat" : "Tambah Ruang Rawat"}
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Kode ruang stabil untuk mapping navigasi pengantaran
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
        {isEdit && <input type="hidden" name="roomId" value={initial.id} />}

        <div className={cardCls}>
          <h2 className="mb-4 text-sm font-semibold text-slate-900">Data Ruang</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="wardId" className={labelCls}>
                Bangsal <span className="text-rose-500">*</span>
              </label>
              <Select
                name="wardId"
                ariaLabel="Bangsal"
                placeholder="- Pilih Bangsal -"
                defaultValue={initial?.wardId ?? presetWardId ?? ""}
                options={wards.map((w) => ({
                  value: w.id,
                  label: `${w.code} - ${w.name}`,
                }))}
              />
            </div>
            <div>
              <label htmlFor="roomCode" className={labelCls}>
                Kode Ruang <span className="text-rose-500">*</span>
              </label>
              <input
                id="roomCode"
                name="roomCode"
                type="text"
                required
                minLength={3}
                defaultValue={initial?.roomCode}
                readOnly={isEdit}
                placeholder="cth: R-MELATI-101"
                autoComplete="off"
                className={`${inputCls} font-mono ${isEdit ? "bg-slate-100 text-slate-500" : ""}`}
              />
              {isEdit && (
                <p className="mt-1 text-[11px] text-slate-500">
                  Kode stabil dan tidak dapat diubah setelah dibuat.
                </p>
              )}
            </div>
            <div className="md:col-span-2">
              <label htmlFor="name" className={labelCls}>
                Nama Ruang <span className="text-rose-500">*</span>
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                minLength={2}
                defaultValue={initial?.name}
                placeholder="cth: Ruang Melati 101"
                autoComplete="off"
                className={inputCls}
              />
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button type="button" onClick={handleConfirmSubmit} disabled={isPending} className={btnPrimary}>
            {isPending ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Menyimpan…
              </>
            ) : isEdit ? (
              "Simpan Perubahan"
            ) : (
              "Simpan Ruang"
            )}
          </button>
          <Link href="/bangsal" className={btnSecondary}>
            Batal
          </Link>
        </div>
      </form>
    </div>
  );
}
