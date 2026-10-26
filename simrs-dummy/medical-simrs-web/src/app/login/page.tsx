"use client";

import { useActionState } from "react";
import { loginAction } from "@/app/actions/auth";
import { AlertTriangle, Eye, EyeOff, LogIn } from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import SimrsLogo from "@/components/SimrsLogo";

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(loginAction, null);
  const [showPw, setShowPw] = useState(false);

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      {/* Synthetic data banner */}
      <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs font-medium text-amber-800">
        <div className="flex items-center justify-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>
            <strong>PROTOTIPE AKADEMIK:</strong> Seluruh data adalah{" "}
            <strong>100% SINTETIS / FIKTIF</strong>. Bukan sistem klinis produksi.
          </span>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          {/* Logo */}
          <div className="mb-8 text-center">
            <SimrsLogo
              tileClassName="h-14 w-14 rounded-2xl"
              iconClassName="h-7 w-7"
              showWordmark={false}
            />
            <h1 className="mt-4 text-2xl font-bold text-slate-900">SIMRS Dummy</h1>
            <p className="mt-1 text-sm text-slate-500">
              Medical Delivery System - Simulation Prototype
            </p>
          </div>

          {/* Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-8">
            <h2 className="mb-6 text-lg font-semibold text-slate-900">Masuk ke Sistem</h2>

            {state?.error && (
              <div className="mb-5 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {state.error}
              </div>
            )}

            <form action={formAction} className="space-y-5">
              <div>
                <label
                  htmlFor="username"
                  className="mb-1.5 block text-xs font-medium text-slate-600"
                >
                  Username
                </label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  required
                  placeholder="dr_budi"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 transition focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="mb-1.5 block text-xs font-medium text-slate-600"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPw ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    placeholder="••••••••"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 pr-10 text-sm text-slate-900 placeholder-slate-400 transition focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-slate-600"
                    aria-label={showPw ? "Sembunyikan password" : "Tampilkan password"}
                  >
                    {showPw ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isPending}
                id="login-submit"
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2 disabled:opacity-60"
              >
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

            {/* Demo accounts quick ref */}
            <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="mb-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Akun Demo (password: demo12345)
              </p>
              <div className="space-y-1 font-mono text-xs">
                {[
                  { u: "sysadmin", r: "SYSTEM_ADMIN" },
                  { u: "admin_simrs", r: "SIMRS_ADMIN" },
                  { u: "dr_budi", r: "DOCTOR" },
                  { u: "apt_dewi", r: "PHARMACIST" },
                  { u: "staf_farmasi", r: "PHARMACY_STAFF" },
                  { u: "perawat_siti", r: "NURSE" },
                  { u: "admin_bangsal", r: "WARD_ADMIN" },
                  { u: "multirole_user", r: "DOCTOR + PHARMACIST" },
                ].map((a) => (
                  <div key={a.u} className="flex items-center justify-between">
                    <span className="text-teal-700">{a.u}</span>
                    <span className="text-slate-500">{a.r}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-slate-400">
            <Link href="/" className="font-medium text-teal-700 hover:underline">
              ← Kembali ke beranda
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
