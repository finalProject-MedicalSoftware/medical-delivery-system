'use client';

export default function OfflinePage() {
  return (
    <main className="min-h-screen bg-neutral-50 flex items-center justify-center p-6 text-neutral-900">
      <section className="max-w-md w-full bg-white border border-neutral-200 rounded-3xl p-8 shadow-sm text-center">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center text-2xl font-bold">N</div>
        <h1 className="mt-6 text-2xl font-bold tracking-tight">NEVO sedang offline</h1>
        <p className="mt-3 text-sm leading-6 text-neutral-500">Koneksi ke aplikasi belum tersedia. Data SIMRS dan perintah robot tidak dikirim saat offline.</p>
        <button onClick={() => window.location.reload()} className="mt-6 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700">Coba lagi</button>
      </section>
    </main>
  );
}
