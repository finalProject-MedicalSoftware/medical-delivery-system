export default function Loading() {
  return <div role="status" aria-label="Memuat halaman" className="space-y-6">
    <div className="skeleton h-10 w-56 mt-8" /><div className="skeleton h-4 w-3/4 max-w-md" />
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{[0, 1, 2, 3].map(n => <div key={n} className="skeleton h-32" />)}</div>
    <div className="skeleton h-80" /><span className="sr-only">Memuat halaman NEVO…</span>
  </div>;
}
