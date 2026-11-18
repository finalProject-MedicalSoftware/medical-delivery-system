"use client";

import { useActionState, useState } from "react";
import { loginAction } from "@/app/actions/auth";
import { AlertTriangle, Eye, EyeOff, LogIn } from "lucide-react";
import SimrsLogo from "@/components/SimrsLogo";
import { btnPrimary, inputCls, labelCls } from "@/components/ui";

const ALUR = [
  ["Resep", "Dokter menulis resep untuk pasien rawat inap."],
  ["Verifikasi", "Apoteker memeriksa dan menyiapkan obat."],
  ["Pengantaran", "Robot membawa obat ke ruang rawat."],
  ["Serah terima", "Perawat memindai gelang pasien dan menerima obat."],
];

const AKUN_DEMO = [
  ["sysadmin", "Admin Sistem"],
  ["admin_simrs", "Admin SIMRS"],
  ["dr_budi", "Dokter"],
  ["apt_dewi", "Apoteker"],
  ["staf_farmasi", "Staf Farmasi"],
  ["perawat_siti", "Perawat"],
  ["admin_bangsal", "Admin Bangsal"],
];

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(loginAction, null);
  const [showPw, setShowPw] = useState(false);

  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="hidden flex-col justify-between bg-teal-950 p-12 text-teal-100 lg:flex">
        <SimrsLogo
          tileClassName="h-9 w-9 rounded-lg bg-teal-600"
          title="SIMRS"
          subtitle="Farmasi & Pengantaran Obat"
          titleClassName="text-white"
          subtitleClassName="text-teal-300"
        />
        <div>
          <h2 className="max-w-sm text-3xl font-semibold leading-tight text-balance text-white">
            Dari resep sampai obat diterima di ruangan.
          </h2>
          <ol className="mt-8 max-w-sm space-y-5">
            {ALUR.map(([judul, isi], i) => (
              <li key={judul} className="flex gap-4">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-teal-400/50 text-xs font-semibold text-teal-200">
                  {i + 1}
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{judul}</p>
                  <p className="text-sm text-teal-300">{isi}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <p className="text-xs text-teal-400">Data demo. Bukan sistem klinis produksi.</p>
      </aside>

      <main className="flex items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <SimrsLogo tileClassName="h-9 w-9 rounded-lg" title="SIMRS" subtitle="Farmasi & Pengantaran Obat" />
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">Masuk</h1>
          <p className="mt-1 text-sm text-slate-500">Gunakan akun petugas rumah sakit Anda.</p>

          {state?.error && (
            <div role="alert" className="mt-5 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {state.error}
            </div>
          )}

          <form action={formAction} className="mt-6 space-y-5">
            <div>
              <label htmlFor="username" className={labelCls}>Username</label>
              <input id="username" name="username" type="text" autoComplete="username" required autoFocus className={inputCls} />
            </div>
            <div>
              <label htmlFor="password" className={labelCls}>Password</label>
              <div className="relative">
                <input id="password" name="password" type={showPw ? "text" : "password"} autoComplete="current-password" required className={`${inputCls} pr-10`} />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-slate-700"
                  aria-label={showPw ? "Sembunyikan password" : "Tampilkan password"}
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={isPending} id="login-submit" className={`${btnPrimary} w-full justify-center py-2.5`}>
              {isPending ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Memproses…
                </>
              ) : (
                <>
                  <LogIn className="h-4 w-4" />
                  Masuk
                </>
              )}
            </button>
          </form>

          <details className="mt-8 rounded-lg border border-slate-200 text-sm">
            <summary className="cursor-pointer select-none px-4 py-3 font-medium text-slate-700">
              Akun demo <span className="font-normal text-slate-500">(password: demo12345)</span>
            </summary>
            <dl className="divide-y divide-slate-100 border-t border-slate-200 px-4 font-mono text-xs">
              {AKUN_DEMO.map(([u, r]) => (
                <div key={u} className="flex justify-between py-2">
                  <dt className="font-medium text-teal-700">{u}</dt>
                  <dd className="font-sans text-slate-500">{r}</dd>
                </div>
              ))}
            </dl>
          </details>
        </div>
      </main>
    </div>
  );
}
