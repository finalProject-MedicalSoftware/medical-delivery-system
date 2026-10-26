"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createMedicineAction, updateMedicineAction } from "@/app/actions/medicines";
import { useConfirm } from "@/components/Confirm";
import { useToast } from "@/components/Toast";
import Link from "next/link";
import { ArrowLeft, Pill, AlertTriangle } from "lucide-react";
import { inputCls, labelCls, cardCls, btnPrimary, btnSecondary } from "@/components/ui";

export interface MedicineInitial {
  id: string;
  code: string;
  name: string;
  unit: string;
  category: string;
  stock: number;
}

export default function MedicineForm({ initial }: { initial?: MedicineInitial }) {
  const isEdit = !!initial;
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const saveAction = isEdit ? updateMedicineAction : createMedicineAction;
  const confirm = useConfirm();
  const formRef = useRef<HTMLFormElement>(null);

  async function handleConfirmSubmit() {
    const ok = await confirm({
      title: isEdit ? "Simpan perubahan?" : "Simpan obat baru?",
      message: isEdit
        ? "Perubahan katalog obat akan dicatat di audit trail."
        : "Obat dummy baru akan ditambahkan ke katalog.",
      confirmLabel: "Simpan",
    });
    if (!ok || !formRef.current) return;
    const fd = new FormData(formRef.current);
    setError(null);
    startTransition(async () => {
      const res = await saveAction(fd);
      if (res.ok) {
        window.setTimeout(() => toast.success(isEdit ? "Perubahan obat tersimpan" : "Data obat tersimpan"), 400);
        router.push(res.to ?? "/obat");
      } else {
        setError(res.error ?? "Gagal menyimpan obat");
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link
          href="/obat"
          className="text-slate-400 transition hover:text-slate-700"
          aria-label="Kembali"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <Pill className="h-5 w-5 text-teal-700" />
            {isEdit ? "Ubah Obat" : "Tambah Obat"}
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Katalog obat dummy untuk simulasi farmasi
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
        {isEdit && <input type="hidden" name="medicineId" value={initial.id} />}

        <div className={cardCls}>
          <h2 className="mb-4 text-sm font-semibold text-slate-900">Data Obat</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="code" className={labelCls}>
                Kode Obat <span className="text-rose-500">*</span>
              </label>
              <input
                id="code"
                name="code"
                type="text"
                required
                minLength={3}
                defaultValue={initial?.code}
                placeholder="cth: MED-PCM-500"
                autoComplete="off"
                className={`${inputCls} font-mono`}
              />
            </div>
            <div>
              <label htmlFor="name" className={labelCls}>
                Nama Obat <span className="text-rose-500">*</span>
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                minLength={2}
                defaultValue={initial?.name}
                placeholder="cth: Paracetamol 500mg"
                autoComplete="off"
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="unit" className={labelCls}>
                Satuan <span className="text-rose-500">*</span>
              </label>
              <input
                id="unit"
                name="unit"
                type="text"
                required
                defaultValue={initial?.unit}
                placeholder="tablet / kapsul / botol / ampul"
                autoComplete="off"
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="category" className={labelCls}>
                Kategori <span className="text-rose-500">*</span>
              </label>
              <input
                id="category"
                name="category"
                type="text"
                required
                defaultValue={initial?.category}
                placeholder="Analgesik / Antibiotik / Vitamin"
                autoComplete="off"
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="stock" className={labelCls}>
                Stok Awal <span className="text-rose-500">*</span>
              </label>
              <input
                id="stock"
                name="stock"
                type="number"
                required
                min={0}
                step={1}
                defaultValue={initial?.stock ?? 100}
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
              "Simpan Obat"
            )}
          </button>
          <Link href="/obat" className={btnSecondary}>
            Batal
          </Link>
        </div>
      </form>
    </div>
  );
}
