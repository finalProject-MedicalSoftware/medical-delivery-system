"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createWardAction, updateWardAction } from "@/app/actions/wards";
import { useConfirm } from "@/components/Confirm";
import { useToast } from "@/components/Toast";
import Link from "next/link";
import { ArrowLeft, Building2, AlertTriangle } from "lucide-react";
import { inputCls, labelCls, cardCls, btnPrimary, btnSecondary } from "@/components/ui";

export interface WardInitial {
  id: string;
  code: string;
  name: string;
  floor: number;
}

export default function WardForm({ initial }: { initial?: WardInitial }) {
  const isEdit = !!initial;
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const saveAction = isEdit ? updateWardAction : createWardAction;
  const confirm = useConfirm();
  const formRef = useRef<HTMLFormElement>(null);

  async function handleConfirmSubmit() {
    const ok = await confirm({
      title: isEdit ? "Simpan perubahan?" : "Simpan bangsal baru?",
      message: isEdit
        ? "Perubahan bangsal akan dicatat di audit trail."
        : "Bangsal baru akan ditambahkan.",
      confirmLabel: "Simpan",
    });
    if (!ok || !formRef.current) return;
    const fd = new FormData(formRef.current);
    setError(null);
    startTransition(async () => {
      const res = await saveAction(fd);
      if (res.ok) {
        window.setTimeout(() => toast.success(isEdit ? "Perubahan bangsal tersimpan" : "Bangsal tersimpan"), 400);
        router.push(res.to ?? "/bangsal");
      } else {
        setError(res.error ?? "Gagal menyimpan bangsal");
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
            <Building2 className="h-5 w-5 text-teal-700" />
            {isEdit ? "Ubah Bangsal" : "Tambah Bangsal"}
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Bangsal menaungi ruang-ruang rawat inap
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
        {isEdit && <input type="hidden" name="wardId" value={initial.id} />}

        <div className={cardCls}>
          <h2 className="mb-4 text-sm font-semibold text-slate-900">Data Bangsal</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="code" className={labelCls}>
                Kode Bangsal <span className="text-rose-500">*</span>
              </label>
              <input
                id="code"
                name="code"
                type="text"
                required
                minLength={3}
                defaultValue={initial?.code}
                readOnly={isEdit}
                placeholder="cth: WARD-MELATI"
                autoComplete="off"
                className={`${inputCls} font-mono ${isEdit ? "bg-slate-100 text-slate-500" : ""}`}
              />
              {isEdit && (
                <p className="mt-1 text-[11px] text-slate-500">
                  Kode stabil dan tidak dapat diubah setelah dibuat.
                </p>
              )}
            </div>
            <div>
              <label htmlFor="name" className={labelCls}>
                Nama Bangsal <span className="text-rose-500">*</span>
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                minLength={2}
                defaultValue={initial?.name}
                placeholder="cth: Bangsal Melati"
                autoComplete="off"
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="floor" className={labelCls}>
                Lantai <span className="text-rose-500">*</span>
              </label>
              <input
                id="floor"
                name="floor"
                type="number"
                required
                min={1}
                max={50}
                step={1}
                defaultValue={initial?.floor ?? 1}
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
              "Simpan Bangsal"
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
