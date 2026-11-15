'use client';
import Link from 'next/link';
import { UserRound, Database, Settings, Bell, ArrowRight, Users } from 'lucide-react';
import { useApp } from '../components/AppShell';
import { useLanguage } from '../components/LanguageProvider';
import { PageHeading, RobotArtwork } from '../components/NevoUI';

export default function SettingsPage() {
  const { user } = useApp();
  const { dict, language } = useLanguage();
  const id = language === 'id';
  const admin = user?.role?.toUpperCase() === 'ADMIN';
  const cards = [
    { href: '/account', title: dict.account.title, description: id ? 'Kelola profil dan keamanan akun' : 'Manage your profile and account security', icon: UserRound },
    { href: '/simrs', title: dict.simrs.title, description: id ? 'Sinkronisasi dan informasi pengiriman SIMRS' : 'SIMRS synchronization and delivery information', icon: Database },
    { href: '/settings/system', title: id ? 'Sistem' : 'System', description: id ? 'Pengaturan aplikasi dan operasional' : 'Application and operational settings', icon: Settings },
    { href: '/settings/notifications', title: id ? 'Notifikasi' : 'Notifications', description: id ? 'Informasi pemberitahuan misi dan sistem' : 'Mission and system notifications', icon: Bell },
  ];
  return <div className="space-y-6">
    <PageHeading title={dict.settings.title} description={id ? 'Kelola konfigurasi sistem, integrasi, dan akun.' : 'Manage system configuration, integrations and your account.'} />
    <div className="settings-layout">
      <div className="settings-cards">{cards.map(({ href, title, description, icon: Icon }) => href === '/settings/system' && !admin ? <div key={href} className="glass-panel settings-card">
        <span className="stat-icon"><Icon size={30} /></span><h2>{title}</h2><p>{id ? 'Pengaturan sistem dikelola administrator.' : 'System settings are managed by an administrator.'}</p>
      </div> : <Link key={href} href={href} className="glass-panel settings-card card-hover">
        <div className="flex justify-between items-center"><span className="stat-icon"><Icon size={30} /></span><ArrowRight size={23} className="txt-sec" /></div><h2>{title}</h2><p>{description}</p>
      </Link>)}</div>
      <RobotArtwork variant="fullbody" className="settings-art" />
    </div>
    {admin && <Link href="/users" className="glass-panel p-5 flex items-center gap-3 card-hover"><Users size={22} className="text-accent" /><span className="font-semibold">{dict.users.title}</span><ArrowRight size={18} className="ml-auto" /></Link>}
  </div>;
}
