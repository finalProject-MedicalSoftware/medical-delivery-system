"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BedDouble,
  ClipboardList,
  FileText,
  LogIn,
  Menu,
  Pill,
  ShieldCheck,
  Truck,
  Users,
  X,
} from "lucide-react";
import SimrsLogo from "@/components/SimrsLogo";

const FEATURES = [
  {
    href: "/pasien",
    icon: Users,
    title: "Pasien Sintetis",
    desc: "Data pasien dan nomor rekam medis fiktif untuk kebutuhan demonstrasi alur.",
  },
  {
    href: "/bangsal",
    icon: BedDouble,
    title: "Bangsal & Ruang",
    desc: "Master bangsal, ruang rawat, dan tempat tidur dummy yang terstruktur.",
  },
  {
    href: "/obat",
    icon: Pill,
    title: "Katalog Obat",
    desc: "Katalog obat dummy beserta stok untuk simulasi penyiapan farmasi.",
  },
  {
    href: "/resep",
    icon: FileText,
    title: "Resep",
    desc: "Order resep oleh dokter dengan verifikasi apoteker sebelum disiapkan.",
  },
  {
    href: "/pengantaran",
    icon: Truck,
    title: "Pengantaran",
    desc: "Permintaan antar obat ke ruang rawat dengan status yang tervalidasi.",
  },
  {
    href: "/audit",
    icon: ClipboardList,
    title: "Audit Trail",
    desc: "Jejak audit setiap tindakan penting lintas peran dan modul.",
  },
];

const STEPS = [
  {
    no: "1",
    title: "Dokter menulis resep",
    desc: "Order resep dibuat untuk pasien rawat inap beserta instruksinya.",
  },
  {
    no: "2",
    title: "Apoteker memverifikasi",
    desc: "Resep ditinjau dan dinyatakan siap sebelum masuk penyiapan.",
  },
  {
    no: "3",
    title: "Staf menyiapkan obat",
    desc: "Staf farmasi menyiapkan obat sesuai item resep yang terverifikasi.",
  },
  {
    no: "4",
    title: "Diantar ke ruang rawat",
    desc: "Permintaan antar dibuat ke kode ruang tujuan dan statusnya dilacak.",
  },
];

const ROLES = [
  { code: "SYSTEM_ADMIN", duty: "Administrasi akun dan role" },
  { code: "SIMRS_ADMIN", duty: "Master data dan konfigurasi" },
  { code: "DOCTOR", duty: "Menulis dan meninjau resep" },
  { code: "NURSE", duty: "Kebutuhan obat ruang rawat" },
  { code: "PHARMACIST", duty: "Verifikasi resep" },
  { code: "PHARMACY_STAFF", duty: "Penyiapan obat" },
  { code: "WARD_ADMIN", duty: "Data bangsal dan ruang" },
];

const NAV_LINKS = [
  { href: "#fitur", label: "Fitur" },
  { href: "#alur", label: "Alur Kerja" },
  { href: "#peran", label: "Peran" },
];

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white text-slate-900 antialiased">
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

      {/* Navigasi */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" aria-label="SIMRS Dummy - beranda">
            <SimrsLogo />
          </Link>
          <nav className="hidden items-center gap-7 md:flex" aria-label="Navigasi utama">
            {NAV_LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="text-sm font-medium text-slate-600 transition-colors hover:text-teal-700 focus-visible:outline-2 focus-visible:outline-teal-700"
              >
                {l.label}
              </a>
            ))}
          </nav>
          <div className="hidden md:block">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
            >
              <LogIn className="h-4 w-4" />
              Masuk
            </Link>
          </div>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-700 md:hidden"
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Tutup menu" : "Buka menu"}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {menuOpen && (
          <nav
            className="border-t border-slate-200 bg-white px-4 py-3 md:hidden"
            aria-label="Navigasi seluler"
          >
            <ul className="space-y-1">
              {NAV_LINKS.map((l) => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    onClick={() => setMenuOpen(false)}
                    className="block rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
              <li className="pt-2">
                <Link
                  href="/login"
                  className="flex items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white"
                >
                  <LogIn className="h-4 w-4" />
                  Masuk
                </Link>
              </li>
            </ul>
          </nav>
        )}
      </header>

      <main>
        {/* Hero */}
        <section className="border-b border-slate-200">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
            <div className="mx-auto max-w-3xl text-center">
              <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-3.5 py-1.5 text-xs font-semibold text-teal-800">
                <ShieldCheck className="h-3.5 w-3.5" />
                Sistem Informasi Manajemen Rumah Sakit
              </p>
              <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-5xl">
                Alur obat rawat inap, dari resep sampai ruangan.
              </h1>
              <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
                SIMRS Dummy mendemonstrasikan permintaan pengantaran obat:
                dokter menulis resep, apoteker memverifikasi, staf menyiapkan,
                dan obat diantar ke ruang rawat - semuanya tercatat dalam
                audit trail.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link
                  href="/login"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-teal-700 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 sm:w-auto"
                >
                  <LogIn className="h-4 w-4" />
                  Masuk ke sistem
                </Link>
                <a
                  href="#alur"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition-colors hover:border-teal-600 hover:text-teal-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 sm:w-auto"
                >
                  Lihat alur kerja
                  <ArrowRight className="h-4 w-4" />
                </a>
              </div>
              <dl className="mx-auto mt-12 grid max-w-2xl grid-cols-3 gap-6 border-t border-slate-200 pt-8">
                {[
                  { v: "8", l: "Modul" },
                  { v: "7", l: "Peran pengguna" },
                  { v: "100%", l: "Data sintetis" },
                ].map((s) => (
                  <div key={s.l}>
                    <dt className="order-2 mt-1 text-xs font-medium text-slate-500 sm:text-sm">
                      {s.l}
                    </dt>
                    <dd className="order-1 text-2xl font-bold text-teal-800 sm:text-3xl">
                      {s.v}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>

        {/* Fitur */}
        <section id="fitur" className="scroll-mt-20 bg-slate-50">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-widest text-teal-700">
                Fitur
              </p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
                Modul yang mencakup seluruh alur
              </h2>
              <p className="mt-3 text-slate-600">
                Setiap modul dilindungi pemeriksaan peran di sisi server.
                Masuk untuk mengakses modul sesuai peran Anda.
              </p>
            </div>
            <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <li
                  key={f.href}
                  className="rounded-xl border border-slate-200 bg-white p-6 transition-colors hover:border-teal-600"
                >
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-teal-700">
                    <f.icon className="h-5 w-5 text-white" />
                  </span>
                  <h3 className="mt-4 text-base font-semibold">{f.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                    {f.desc}
                  </p>
                  <Link
                    href="/login"
                    className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-teal-700 hover:text-teal-800"
                  >
                    Buka modul
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Alur */}
        <section id="alur" className="scroll-mt-20 border-y border-slate-200 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-widest text-teal-700">
                Alur kerja
              </p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
                Empat langkah yang tervalidasi
              </h2>
              <p className="mt-3 text-slate-600">
                Status tidak bisa berubah sembarangan - setiap transisi
                divalidasi di server sesuai peran yang berwenang.
              </p>
            </div>
            <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((s) => (
                <li
                  key={s.no}
                  className="rounded-xl border border-slate-200 bg-white p-6"
                >
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-teal-700 text-base font-bold text-white">
                    {s.no}
                  </span>
                  <h3 className="mt-4 text-base font-semibold">{s.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                    {s.desc}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Peran */}
        <section id="peran" className="scroll-mt-20 bg-slate-50">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-widest text-teal-700">
                Peran
              </p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
                Satu akun, bisa banyak peran
              </h2>
              <p className="mt-3 text-slate-600">
                Akses ditentukan relasi pengguna dan peran di database, bukan satu
                kolom role. Misalnya satu akun bisa merangkap dokter dan
                apoteker.
              </p>
            </div>
            <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {ROLES.map((r) => (
                <li
                  key={r.code}
                  className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4"
                >
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-teal-700" />
                  <span>
                    <span className="block font-mono text-sm font-semibold">
                      {r.code}
                    </span>
                    <span className="mt-0.5 block text-sm text-slate-600">
                      {r.duty}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* CTA */}
        <section className="bg-white">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <div className="rounded-2xl bg-slate-900 px-6 py-12 text-center sm:px-12 sm:py-16">
              <h2 className="mx-auto max-w-2xl text-2xl font-bold tracking-tight text-white sm:text-3xl">
                Siap mencoba alur pengantaran obat?
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-slate-300 sm:text-base">
                Masuk dengan salah satu akun peran untuk melihat sistem dari
                sudut pandang dokter, apoteker, perawat, maupun admin.
              </p>
              <Link
                href="/login"
                className="mt-8 inline-flex items-center gap-2 rounded-lg bg-teal-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-teal-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <LogIn className="h-4 w-4" />
                Masuk ke sistem
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-slate-950 text-slate-300">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-3">
          <div>
            <SimrsLogo
              titleClassName="text-white"
              subtitleClassName="text-slate-400"
            />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-slate-400">
              Prototipe akademik alur permintaan pengantaran obat ke ruang
              rawat inap. Seluruh data pasien, resep, staf, dan obat adalah
              fiktif.
            </p>
          </div>
          <nav aria-label="Tautan modul">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
              Modul
            </p>
            <ul className="mt-3 space-y-2 text-sm">
              {FEATURES.map((f) => (
                <li key={f.href}>
                  <Link href="/login" className="transition-colors hover:text-white">
                    {f.title}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
              Catatan
            </p>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              Bukan sistem klinis produksi dan belum terhubung ke SIMRS rumah
              sakit nyata maupun perangkat robot. Status gerak robot bersifat
              simulasi.
            </p>
          </div>
        </div>
        <div className="border-t border-slate-800">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-5 text-xs text-slate-500 sm:flex-row sm:px-6">
            <span>SIMRS Dummy - Medical Delivery System</span>
            <span>Data 100% sintetis</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
