'use client';
import { AlertTriangle } from 'lucide-react';
import { EmptyState } from './components/NevoUI';
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div><section className="glass-panel mt-8">
    <EmptyState icon={AlertTriangle} title="Halaman belum dapat ditampilkan" description="Terjadi kesalahan saat memuat halaman. Coba muat ulang untuk melanjutkan." action={<button onClick={reset} className="btn-primary">Coba lagi</button>} />
  </section></div>;
}
