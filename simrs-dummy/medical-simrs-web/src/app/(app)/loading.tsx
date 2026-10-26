export default function AppLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Memuat halaman">
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-5">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-teal-700 border-t-transparent" />
        <p className="text-sm font-medium text-slate-600">Memuat data…</p>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="h-3 w-2/3 rounded bg-slate-100" />
            <div className="mt-3 h-7 w-1/2 rounded bg-slate-100" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="h-4 w-1/3 rounded bg-slate-100" />
        <div className="mt-4 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-9 rounded-lg bg-slate-50" />
          ))}
        </div>
      </div>
    </div>
  );
}
