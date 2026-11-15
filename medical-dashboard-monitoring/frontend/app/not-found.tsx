import Link from 'next/link';
import { EmptyState } from './components/NevoUI';
export default function NotFound() {
  return <div><section className="glass-panel mt-8">
    <EmptyState title="Halaman tidak ditemukan" description="Pilih menu navigasi atau kembali ke Dashboard." action={<Link href="/dashboard" className="btn-primary">Ke Dashboard</Link>} />
  </section></div>;
}
