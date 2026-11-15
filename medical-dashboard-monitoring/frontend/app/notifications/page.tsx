'use client';

import Link from 'next/link';
import { PageHeading, EmptyState, StatCard } from '../components/NevoUI';
import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../components/AppShell';
import { useLanguage } from '../components/LanguageProvider';
import { statusPillClass } from '../lib/mission-status';
import { AlertTriangle, Radio, Search, Layers, Clock, CheckCircle2, XCircle, ClipboardList, Ban } from 'lucide-react';

type EventRow = {
  key: string;
  time: string;
  status: string;
  message: string;
  missionId?: number;
  progress?: number;
};

export default function NotificationsPage() {
  const { wsConnected, missionEvents } = useApp();
  const { dict } = useLanguage();
  const t = dict.notifications;
  const tc = dict.common;

  const [rows, setRows] = useState<EventRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const seq = useRef(0);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setRows(missionEvents.map((event) => ({
      key: event.eventId || `ev${++seq.current}`,
      time: event.timestamp ? new Date(event.timestamp).toLocaleString() : new Date().toLocaleString(),
      status: event.status || 'INFO',
      message: event.message || '',
      missionId: event.missionId,
      progress: event.progress,
    })));
  }, [missionEvents]);

  const live = wsConnected;
  const filtered = statusFilter === 'ALL' ? rows : rows.filter((r) => r.status === statusFilter);

  const STATUSES = ['ALL', 'CREATED', 'PENDING', 'EXECUTING', 'SUCCEEDED', 'CANCELLED', 'FAILED'];

  const visible = filtered.filter(r => (r.message + ' ' + (r.missionId ?? '') + ' ' + r.status).toLowerCase().includes(search.toLowerCase()));
  return <div className="activity-page space-y-6">
    <PageHeading title={t.title} description={t.subtitle} robot />
    {!live && <p role="status" className="rounded-xl bg-warning/10 text-warning p-3 text-sm flex items-center gap-2"><AlertTriangle size={18} />{tc.disconnected} · {t.live}</p>}
    <div className="nevo-tabs activity-tabs">{STATUSES.map(status => <button key={status} onClick={() => setStatusFilter(status)} aria-pressed={statusFilter === status} className={statusFilter === status ? 'bg-accent text-white' : 'txt-sec'}>{status === 'ALL' ? tc.all : status}</button>)}</div>
    <div className="activity-stats grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
      <StatCard label={t.title} value={rows.length} icon={Layers} />
      <StatCard label={dict.missions.statusCreated} value={rows.filter(r => r.status === 'CREATED').length} icon={ClipboardList} />
      <StatCard label={dict.missions.statusPending} value={rows.filter(r => r.status === 'PENDING').length} icon={Clock} tone="warning" />
      <StatCard label={dict.missions.statusExecuting} value={rows.filter(r => r.status === 'EXECUTING').length} icon={Clock} />
      <StatCard label={dict.missions.statusSucceeded} value={rows.filter(r => r.status === 'SUCCEEDED').length} icon={CheckCircle2} tone="success" />
      <StatCard label={dict.missions.statusFailed} value={rows.filter(r => r.status === 'FAILED').length} icon={XCircle} />
      <StatCard label={dict.missions.statusCancelled} value={rows.filter(r => r.status === 'CANCELLED').length} icon={Ban} />
    </div>
    <section className="glass-panel p-6">
      <div className="flex justify-between flex-wrap items-center gap-4 mb-5"><h2 className="section-title">{t.title}</h2><label className="relative"><span className="sr-only">{tc.search}</span><Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 txt-sec" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder={tc.search} className="input-field !pl-10" /></label></div>
      <p className="text-xs txt-sec mb-4">{`Menampilkan ${rows.length} event misi yang diterima selama sesi ini. Riwayat permanen tidak tersedia.`}</p>
      {visible.length === 0 ? <EmptyState title={t.noEvents} description="Belum ada event misi yang cocok pada sesi ini." icon={Radio} /> : <div className="overflow-x-auto"><table className="w-full text-left" aria-label={t.title}><thead><tr><th className="p-3">{dict.missions.eventsTime}</th><th className="p-3">Kategori</th><th className="p-3">{dict.missions.eventsMessage}</th><th className="p-3">{tc.status}</th><th className="p-3">{tc.actions}</th></tr></thead><tbody className="divide-y divide-border-base">
        {visible.map(r => <tr key={r.key}><td className="p-3 whitespace-nowrap font-mono">{r.time}</td><td className="p-3">Misi</td><td className="p-3"><p className="font-medium">{r.message}</p>{r.missionId != null && <p className="text-xs txt-sec">Misi #{r.missionId}{r.progress != null ? ' · ' + r.progress + '%' : ''}</p>}</td><td className="p-3"><span className={`status-pill ${statusPillClass(r.status)}`}>{r.status}</span></td><td className="p-3">{r.missionId != null ? <Link href={`/missions/${r.missionId}`} className="text-accent font-semibold">{dict.missions.viewDetail}</Link> : '—'}</td></tr>)}
      </tbody></table></div>}
    </section>
  </div>;
}
