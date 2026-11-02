import Link from "next/link";
import { AlertTriangle, ArrowRight, LogIn, ShieldCheck } from "lucide-react";
import SimrsLogo from "@/components/SimrsLogo";

const STEPS = [
  { no: "1", title: "Dokter menulis resep", desc: "Order resep untuk pasien rawat inap beserta instruksinya." },
  { no: "2", title: "Apoteker memverifikasi", desc: "Resep ditinjau dan dinyatakan siap sebelum disiapkan." },
  { no: "3", title: "Staf menyiapkan obat", desc: "Staf farmasi menyiapkan obat sesuai item resep." },
  { no: "4", title: "Diantar ke ruang rawat", desc: "Permintaan antar dibuat ke kode ruang tujuan." },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-page text-txt-main antialiased">
      {/* Pita data sintetis */}
      <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs font-medium text-amber-800">
        <div className="mx-auto flex max-w-6xl items-center justify-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>
            <strong>PROTOTIPE AKADEMIK</strong> - seluruh data 100% sintetis/fiktif,
            bukan sistem klinis produksi.
          </span>
        </div>
      </div>

      {/* Header minimal: logo + masuk */}
      <header className="border-b border-slate-200">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <SimrsLogo />
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            <LogIn className="h-4 w-4" />
            Masuk
          </Link>
        </div>
      </header>

      <main>
        {/* Hero gelap gaya tifa-web */}
        <section className="bg-sidebar">
          <div className="mx-auto max-w-6xl px-4 py-20 text-center sm:px-6 sm:py-28">
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3.5 py-1.5 text-xs font-semibold text-teal-300">
              <ShieldCheck className="h-3.5 w-3.5" />
              SIMRS Dummy - Medical Delivery System
            </p>
            <h1 className="mx-auto max-w-3xl text-3xl font-bold leading-tight tracking-tight text-white sm:text-5xl">
              Alur obat rawat inap, dari resep sampai ruangan.
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
              Dokter menulis resep, apoteker memverifikasi, staf menyiapkan,
              dan obat diantar ke ruang rawat - semuanya tercatat dalam audit trail.
            </p>
            <Link
              href="/login"
              className="mt-8 inline-flex items-center gap-2 rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-white shadow-[0_4px_12px_rgba(0,139,139,0.35)] transition hover:bg-accent-hover"
            >
              <LogIn className="h-4 w-4" />
              Masuk ke sistem
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        {/* Alur kerja */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Empat langkah yang tervalidasi
          </h2>
          <p className="mt-2 text-slate-600">
            Setiap transisi status divalidasi di server sesuai peran yang berwenang.
          </p>
          <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <li key={s.no} className="glass-panel p-6">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-accent text-base font-bold text-white">
                  {s.no}
                </span>
                <h3 className="mt-4 text-base font-semibold">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{s.desc}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <footer className="border-t border-slate-200">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-1 px-4 py-6 text-xs text-slate-500 sm:flex-row sm:px-6">
          <span>SIMRS Dummy - Data 100% sintetis</span>
          <span>Status gerak robot bersifat simulasi</span>
        </div>
      </footer>
    </div>
  );
}
