'use client';
import Link from 'next/link';
import { Bell, ArrowRight, Radio } from 'lucide-react';
import { useApp } from '../../components/AppShell';
import { useLanguage } from '../../components/LanguageProvider';
import { PageHeading } from '../../components/NevoUI';

export default function NotificationSettingsPage() {
  const { wsConnected } = useApp();
  const { language } = useLanguage();
  const id = language === 'id';
  return <div className="space-y-6">
    <PageHeading title={id ? 'Pengaturan Notifikasi' : 'Notification Settings'} description={id ? 'Pemberitahuan aktivitas misi pada aplikasi NEVO.' : 'Mission activity notifications in NEVO.'} actions={<Link className="btn-secondary" href="/settings">{id ? 'Kembali' : 'Back'}</Link>} />
    <section className="glass-panel p-6 space-y-5 max-w-3xl">
      <h2 className="section-title"><Bell size={24} />{id ? 'Aktivitas misi' : 'Mission activity'}</h2>
      <p className="txt-sec">{id ? 'Perubahan status dan progres misi tersedia melalui Log Aktivitas selama sesi aplikasi berjalan.' : 'Mission status and progress events are available in Activity Log during your session.'}</p>
      {!wsConnected && <p role="status" className="rounded-xl bg-warning/10 p-3 text-sm text-warning">{id ? 'Pembaruan langsung belum tersedia. Periksa koneksi operasional pada Pengaturan Sistem.' : 'Live updates are unavailable. Check operational connection settings.'}</p>}
      <p className="text-sm txt-sec">{id ? 'Preferensi per kategori, email, dan push notification belum tersedia pada sistem ini.' : 'Per-category preferences, email and push notifications are not available in this system.'}</p>
      <Link className="btn-primary inline-flex items-center gap-2" href="/notifications"><Radio size={18} />{id ? 'Buka Log Aktivitas' : 'Open Activity Log'}<ArrowRight size={16} /></Link>
    </section>
  </div>;
}
