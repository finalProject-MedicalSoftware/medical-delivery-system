'use client';

import React, { useEffect, useState } from 'react';
import { PageHeading, RobotArtwork, EmptyState } from '../../components/NevoUI';
import { useApp } from '../../components/AppShell';
import { useLanguage } from '../../components/LanguageProvider';
import { Bot, RefreshCw, AlertOctagon } from 'lucide-react';

type Row = {
  robotId: string; name: string; model?: string | null; deviceCode?: string | null;
  internalIp?: string | null; ssid?: string | null; registrationStatus: string;
  connectionStatus: string; registeredAt?: string | null; updatedAt?: string | null;
};
const FIELD = 'w-full bg-input border border-base rounded-lg px-3.5 py-2.5 text-sm txt-main outline-none focus:border-accent';
const blank = { robotId: '', name: '', model: '', deviceCode: '', internalIp: '', ssid: '' };

export default function RobotRegistryPage() {
  const { user, request } = useApp();
  const { dict, language } = useLanguage();
  const t = dict.robotRegistry, tc = dict.common;
  const isAdmin = (user?.role || '').toUpperCase() === 'ADMIN';
  const [rows, setRows] = useState<Row[]>([]);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const update = (key: keyof typeof blank, value: string) => setForm(f => ({ ...f, [key]: value }));
  const refresh = () => {
    setLoading(true);
    request('robots/registry').then((data: Row[]) => setRows(Array.isArray(data) ? data : []))
      .catch((e: Error) => setError(e.message || 'Backend tidak tersedia'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { refresh(); }, []);
  const startCreate = () => { setForm(blank); setEditing(null); setShowForm(true); setError(null); };
  const startEdit = (row: Row) => {
    setForm({ robotId: row.robotId, name: row.name, model: row.model || '', deviceCode: row.deviceCode || '',
      internalIp: row.internalIp || '', ssid: row.ssid || '' });
    setEditing(row.robotId); setShowForm(true); setError(null);
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError(null); setSuccess(null);
    try {
      await request(editing ? `robots/${encodeURIComponent(editing)}` : 'robots', {
        method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, robotId: editing || form.robotId || null })
      });
      setSuccess(editing ? 'Metadata robot diperbarui.' : 'Registrasi tersimpan; robot belum terverifikasi.');
      setShowForm(false); setEditing(null); setForm(blank); refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Backend tidak tersedia'); }
    finally { setSaving(false); }
  };
  const act = async (row: Row, kind: 'disable' | 'archive') => {
    if (!window.confirm(kind === 'disable'
      ? 'Nonaktifkan robot? Ini tidak menghentikan robot fisik.'
      : 'Arsipkan robot? Histori misi dan command tetap disimpan.')) return;
    setSaving(true); setError(null);
    try {
      await request(`robots/${encodeURIComponent(row.robotId)}/${kind}`, { method: 'POST' });
      setSuccess(kind === 'disable' ? 'Robot dinonaktifkan.' : 'Robot diarsipkan.');
      setSelected(null); refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Backend tidak tersedia'); }
    finally { setSaving(false); }
  };
  const date = (v?: string | null) => v ? new Date(v).toLocaleString(language === 'id' ? 'id-ID' : 'en-US') : '—';
  return <div className="space-y-6">
    <PageHeading title={t.title} description={t.subtitle} actions={<>
      {isAdmin && <button onClick={startCreate} className="btn-primary flex items-center gap-2"><Bot size={18}/>{t.addRobot}</button>}
      <button onClick={refresh} disabled={loading} className="btn-secondary flex items-center gap-2"><RefreshCw size={18}/>{tc.refresh}</button>
    </>} />
    {error && <div className="glass-panel p-4 border-error/40 bg-error/5 flex gap-2"><AlertOctagon size={16}/>{error}</div>}
    {success && <div className="glass-panel p-4">{success}</div>}
    {isAdmin && showForm && <div className="glass-panel p-6">
      <h2 className="font-semibold mb-4">{editing ? 'Edit Robot' : t.addRobot}</h2>
      <form onSubmit={submit} className="grid md:grid-cols-3 gap-4">
        <label className="text-xs txt-sec">{t.robotName} *<input className={FIELD} value={form.name} onChange={e => update('name', e.target.value)} maxLength={150} required /></label>
        <label className="text-xs txt-sec">{t.robotId}<input className={FIELD} value={form.robotId} onChange={e => update('robotId', e.target.value)} readOnly={!!editing} minLength={3} maxLength={64} pattern="[A-Za-z0-9_.-]*" placeholder="Otomatis jika kosong" /></label>
        <label className="text-xs txt-sec">Device Code<input className={FIELD} value={form.deviceCode} onChange={e => update('deviceCode', e.target.value)} maxLength={128} pattern="[A-Za-z0-9_.:-]*" /></label>
        <label className="text-xs txt-sec">{t.model}<input className={FIELD} value={form.model} onChange={e => update('model', e.target.value)} maxLength={100} /></label>
        <label className="text-xs txt-sec">Internal IP<input className={FIELD} value={form.internalIp} onChange={e => update('internalIp', e.target.value)} placeholder="192.168.1.10" /></label>
        <label className="text-xs txt-sec">SSID<input className={FIELD} value={form.ssid} onChange={e => update('ssid', e.target.value)} maxLength={255} /></label>
        <p className="md:col-span-3 text-xs txt-sec">Kode perangkat dapat ditambahkan setelah disediakan oleh tim robot. Mengisi kode tidak memverifikasi robot.</p>
        <div className="md:col-span-3 flex gap-3"><button className="btn-primary" disabled={saving}>{saving ? tc.loading : editing ? 'Simpan perubahan' : t.addRobot}</button>
          <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>{tc.cancel}</button></div>
      </form>
    </div>}
    <div className="registry-layout"><RobotArtwork variant="fullbody" className="registry-art" />
      <div className="space-y-5">{loading ? <div className="glass-panel p-10">{tc.loading}</div> :
        rows.length === 0 ? <div className="glass-panel"><EmptyState title={t.tableEmpty} icon={Bot}/></div> :
        rows.map(r => <article key={r.robotId} className="glass-panel robot-record">
          <h2>{r.name}</h2><p className="txt-sec text-sm mt-2 mb-4">{r.robotId}</p>
          <dl><div><dt>{t.model}</dt><dd>{r.model || '—'}</dd></div>
            <div><dt>Status Registrasi</dt><dd>{r.registrationStatus || 'DRAFT'}</dd></div>
            <div><dt>Status Koneksi</dt><dd>{r.connectionStatus || 'UNKNOWN'}</dd></div>
            <div><dt>{t.registeredAt}</dt><dd>{date(r.registeredAt)}</dd></div></dl>
          <div className="flex flex-wrap gap-2 mt-4">
            <button className="btn-secondary" onClick={() => setSelected(r)}>Detail</button>
            {isAdmin && r.registrationStatus !== 'ARCHIVED' && <button className="btn-secondary" onClick={() => startEdit(r)}>Edit</button>}
            {isAdmin && !['DISABLED','ARCHIVED'].includes(r.registrationStatus) && <button className="btn-secondary" disabled={saving} onClick={() => act(r,'disable')}>Disable</button>}
            {isAdmin && r.registrationStatus === 'DISABLED' && <button className="btn-secondary" disabled={saving} onClick={() => act(r,'archive')}>Archive</button>}
          </div>
        </article>)}</div>
    </div>
    {selected && <div className="glass-panel p-5">
      <div className="flex justify-between gap-3"><h2 className="font-semibold">{selected.name}</h2><button className="btn-secondary" onClick={() => setSelected(null)}>Tutup</button></div>
      <dl className="grid sm:grid-cols-2 gap-3 mt-4 text-sm">
        <div><dt>Robot ID</dt><dd>{selected.robotId}</dd></div>
        {isAdmin && <div><dt>Device Code</dt><dd>{selected.deviceCode || '—'}</dd></div>}
        <div><dt>Internal IP</dt><dd>{selected.internalIp || '—'}</dd></div>
        <div><dt>SSID</dt><dd>{selected.ssid || '—'}</dd></div>
        <div><dt>Status Registrasi</dt><dd>{selected.registrationStatus}</dd></div>
        <div><dt>Status Koneksi</dt><dd>{selected.connectionStatus}</dd></div>
        <div><dt>Diperbarui</dt><dd>{date(selected.updatedAt)}</dd></div>
      </dl>
    </div>}
  </div>;
}
