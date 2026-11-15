'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, RefreshCw, Save, ShieldAlert } from 'lucide-react';
import { PageHeading } from '../components/NevoUI';
import { useApp } from '../components/AppShell';
import { useLanguage } from '../components/LanguageProvider';

type SimrsStatus = {
  code?: string;
  message?: string;
  lastSyncTime?: string;
};

type SimrsConfig = {
  baseUrl?: string;
  configured?: boolean;
};

function validateUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return 'URL harus menggunakan HTTP atau HTTPS.';
    if (url.username || url.password) return 'URL tidak boleh memuat username atau password.';
    if (url.search || url.hash) return 'Gunakan Base URL tanpa query atau fragment.';
    return null;
  } catch {
    return 'Masukkan Base URL yang valid.';
  }
}

export default function SimrsPage() {
  const { request, user } = useApp();
  const { language } = useLanguage();
  const id = language === 'id';
  const admin = user?.role?.toUpperCase() === 'ADMIN';
  const [status, setStatus] = useState<SimrsStatus | null>(null);
  const [baseUrl, setBaseUrl] = useState('');
  const [savedUrl, setSavedUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<'save' | 'test' | null>(null);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextStatus, config] = await Promise.all([
        request('integrations/simrs/status'),
        request('integrations/simrs/config'),
      ]) as [SimrsStatus, SimrsConfig];
      const nextUrl = config.baseUrl || '';
      setStatus(nextStatus);
      setBaseUrl(nextUrl);
      setSavedUrl(nextUrl);
    } catch (error) {
      setStatus(null);
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Konfigurasi SIMRS tidak dapat dimuat.' });
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => { void load(); }, [load]);

  const validation = useMemo(() => baseUrl.trim() ? validateUrl(baseUrl.trim()) : 'Base URL wajib diisi.', [baseUrl]);
  const connected = !loading && status?.code === 'CONNECTED';
  const checking = loading || action !== null;
  const statusLabel = checking
    ? (id ? 'Memeriksa Koneksi' : 'Checking Connection')
    : connected
      ? (id ? 'Terhubung' : 'Connected')
      : (id ? 'Tidak Terhubung' : 'Disconnected');

  const testConnection = async () => {
    setFeedback(null);
    if (validation) { setFeedback({ tone: 'error', text: validation }); return; }
    setAction('test');
    try {
      await request('simrs/admin/config/test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ baseUrl: baseUrl.trim() }),
      });
      setFeedback({ tone: 'success', text: id ? 'Koneksi berhasil diuji. URL aktif belum diubah.' : 'Connection test passed. The active URL was not changed.' });
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Uji koneksi gagal.' });
    } finally { setAction(null); }
  };

  const saveUrl = async () => {
    setFeedback(null);
    if (validation) { setFeedback({ tone: 'error', text: validation }); return; }
    setAction('save');
    try {
      const config = await request('simrs/admin/config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ baseUrl: baseUrl.trim() }),
      }) as SimrsConfig;
      const nextUrl = config.baseUrl || baseUrl.trim();
      setBaseUrl(nextUrl);
      setSavedUrl(nextUrl);
      setStatus(await request('integrations/simrs/status'));
      setFeedback({ tone: 'success', text: id ? 'Base URL tersimpan dan sudah digunakan oleh backend.' : 'Base URL saved and now active on the backend.' });
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Base URL tidak dapat disimpan.' });
    } finally { setAction(null); }
  };

  return (
    <div className="space-y-6">
      <PageHeading
        title={id ? 'Integrasi SIMRS' : 'SIMRS Integration'}
        description={id ? 'Kelola koneksi API Sistem Informasi Manajemen Rumah Sakit.' : 'Manage the Hospital Information System API connection.'}
      />

      <section className="glass-panel p-5 sm:p-6 max-w-3xl" aria-labelledby="simrs-status-title">
        <div className="flex items-start gap-3">
          <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${checking ? 'bg-warning/10 text-warning' : connected ? 'bg-success/10 text-success' : 'bg-error/10 text-error'}`}>
            {checking ? <Loader2 className="animate-spin" size={20} /> : connected ? <CheckCircle2 size={20} /> : <ShieldAlert size={20} />}
          </span>
          <div className="min-w-0">
            <p id="simrs-status-title" className="text-xs font-medium txt-sec">{id ? 'Status koneksi' : 'Connection status'}</p>
            <p className="mt-1 font-semibold txt-main" aria-live="polite">{statusLabel}</p>
            {!checking && !connected && <p className="mt-1 text-sm txt-sec">{status?.message || (id ? 'Backend belum menerima respons SIMRS yang valid.' : 'The backend has not received a valid SIMRS response.')}</p>}
            {status?.lastSyncTime && <p className="mt-1 text-xs txt-sec">{id ? 'Pemeriksaan berhasil terakhir' : 'Last successful check'}: {new Date(status.lastSyncTime).toLocaleString(id ? 'id-ID' : 'en-US')}</p>}
          </div>
        </div>
      </section>

      <section className="glass-panel p-5 sm:p-6 max-w-3xl space-y-5" aria-labelledby="simrs-config-title">
        <div>
          <h2 id="simrs-config-title" className="font-semibold txt-main">{id ? 'Konfigurasi API' : 'API Configuration'}</h2>
          <p className="mt-1 text-sm txt-sec">{admin ? (id ? 'URL diuji oleh backend sebelum diaktifkan.' : 'The backend tests the URL before activation.') : (id ? 'Konfigurasi hanya dapat diubah oleh Admin.' : 'Only an Admin can change this configuration.')}</p>
        </div>

        <div className="space-y-2">
          <label htmlFor="simrs-base-url" className="text-sm font-medium txt-main">Base URL API SIMRS</label>
          <input
            id="simrs-base-url"
            className="input-field font-mono"
            type="url"
            inputMode="url"
            autoComplete="url"
            placeholder="https://simrs.example.id"
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            disabled={loading || action !== null || !admin}
            readOnly={!admin}
            aria-invalid={admin && Boolean(baseUrl && validation)}
            aria-describedby="simrs-url-help"
          />
          <p id="simrs-url-help" className={`text-xs ${admin && baseUrl && validation ? 'text-error' : 'txt-sec'}`}>
            {admin && baseUrl && validation ? validation : (id ? 'Credential dan token tetap tersimpan di backend.' : 'Credentials and tokens remain on the backend.')}
          </p>
        </div>

        {feedback && <div role={feedback.tone === 'error' ? 'alert' : 'status'} className={`rounded-xl border p-3 text-sm ${feedback.tone === 'success' ? 'border-success/30 bg-success/5 text-success' : 'border-error/30 bg-error/5 text-error'}`}>{feedback.text}</div>}

        {admin && <div className="flex flex-col sm:flex-row gap-3">
          <button type="button" className="btn-primary inline-flex items-center justify-center gap-2" onClick={saveUrl} disabled={checking || Boolean(validation) || baseUrl.trim() === savedUrl}>
            {action === 'save' ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}{id ? 'Simpan URL' : 'Save URL'}
          </button>
          <button type="button" className="btn-secondary inline-flex items-center justify-center gap-2" onClick={testConnection} disabled={checking || Boolean(validation)}>
            {action === 'test' ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}{id ? 'Uji Koneksi' : 'Test Connection'}
          </button>
        </div>}
      </section>
    </div>
  );
}
