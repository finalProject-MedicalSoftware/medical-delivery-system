'use client';

/**
 * Settings (prod): hanya kendali fungsional — status relay, URL backend
 * SIMRS, URL gateway WS, token gateway. UI ID otomatis turunan login
 * (`dashboard-<username>`, di-cache server saat relay ON). Disimpan
 * server-side via POST /api/ws/session; simpan URL salah kini ditolak
 * server (probe auth/csrf) sebelum diterapkan.
 */
import React, { useEffect, useState } from 'react';
import { Save, Settings } from 'lucide-react';

type Endpoints = { simrsUrl: string; wsUrl: string };
type Identity = { uiId: string; robotId?: string; mapId?: number };
type SessionView = {
  conn: { on: boolean; lockBy: string | null; authedAt: number };
  tokenPresent: boolean;
  tokenPrefix: string | null;
  wsTarget: string;
  relayPath: string;
  endpoints: Endpoints;
  identity: Identity | null;
  uiIdRelay?: string | null;
};

export default function SettingsPage() {
  const [view, setView] = useState<SessionView | null>(null);
  const [draft, setDraft] = useState<Endpoints & { wsToken: string }>({ simrsUrl: '', wsUrl: '', wsToken: '' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const post = async (body: Record<string, unknown>) => {
    const res = await fetch('/api/ws/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data: Record<string, string> = await res.json();
    if (!res.ok) throw new Error([data.error, data.detail].filter(Boolean).join(' — ') || 'Unable to update connection settings.');
    window.dispatchEvent(new Event('nevo:ws-session-changed'));
    return data as unknown as SessionView;
  };

  const applyView = (v: SessionView) => {
    setView(v);
    setDraft({ simrsUrl: v.endpoints?.simrsUrl ?? '', wsUrl: v.endpoints?.wsUrl ?? '', wsToken: '' });
  };

  useEffect(() => {
    fetch('/api/ws/session', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => { if (data.error) throw new Error(data.error); applyView(data as SessionView); })
      .catch((error) => setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Unable to load connection settings.' }));
  }, []);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      applyView(await post({ action: 'setConnection', endpoints: { simrsUrl: draft.simrsUrl.trim(), wsUrl: draft.wsUrl.trim() }, wsToken: draft.wsToken }));
      setMessage({ type: 'success', text: 'Connection saved.' });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Unable to save connection settings.' });
    } finally {
      setSaving(false);
    }
  };

  const toggleRelay = async () => {
    if (!view) return;
    setSaving(true);
    setMessage(null);
    try {
      const turningOn = !view.conn.on;
      applyView(await post({ action: turningOn ? 'turnOn' : 'turnOff' }));
      setMessage({ type: 'success', text: `Relay ${turningOn ? 'ON' : 'OFF'}.` });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Unable to update relay.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="glass-panel p-6">
        <h1 className="text-xl font-bold txt-main flex items-center gap-2"><Settings className="text-accent" size={22} />Connection settings</h1>
        <p className="text-xs txt-sec mt-1">Backend REST, gateway WS, dan relay live event. URL salah ditolak server saat simpan — login tidak bisa ter-brick lagi.</p>
      </div>

      <section className="glass-panel p-6 space-y-4">
        {message && <p className={`text-xs ${message.type === 'success' ? 'text-success' : 'text-error'}`}>{message.text}</p>}

        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold txt-main">Live event relay</p>
            <p className="text-xs txt-sec">UI ID relay: <code className="font-mono">{view?.uiIdRelay || 'dashboard-&lt;login&gt; (otomatis saat ON)'}</code></p>
          </div>
          <button type="button" onClick={toggleRelay} disabled={saving || !view} className={view?.conn?.on ? 'btn-secondary' : 'btn-primary'}>
            {view?.conn?.on ? 'Turn OFF' : 'Turn ON'}
          </button>
        </div>

        <label className="block space-y-1.5 text-xs txt-sec">
          <span>Backend SIMRS URL (REST, /api/v1)</span>
          <input value={draft.simrsUrl} onChange={(e) => { setDraft((d) => ({ ...d, simrsUrl: e.target.value })); setMessage(null); }} placeholder="http://127.0.0.1:8082" className="input-field w-full font-mono" />
        </label>
        <label className="block space-y-1.5 text-xs txt-sec">
          <span>WebSocket gateway URL</span>
          <input value={draft.wsUrl} onChange={(e) => { setDraft((d) => ({ ...d, wsUrl: e.target.value })); setMessage(null); }} placeholder="ws://127.0.0.1:8083/ws/v1/deliveries" className="input-field w-full font-mono" />
        </label>
        <label className="block space-y-1.5 text-xs txt-sec">
          <span>Gateway token — kosongkan bila tidak berubah</span>
          <input type="password" value={draft.wsToken} onChange={(e) => { setDraft((d) => ({ ...d, wsToken: e.target.value })); setMessage(null); }} className="input-field w-full font-mono" />
        </label>

        <dl className="grid grid-cols-2 gap-3 text-xs">
          <div className="bg-elevated rounded-xl p-3 border border-border-base">
            <dt className="txt-sec">Gateway token (aktif)</dt>
            <dd className="font-mono txt-main mt-1">{view?.tokenPresent ? view.tokenPrefix : 'not set'}</dd>
          </div>
          <div className="bg-elevated rounded-xl p-3 border border-border-base">
            <dt className="txt-sec">Relay target</dt>
            <dd className="font-mono txt-main mt-1">{view?.wsTarget ?? '—'}</dd>
          </div>
        </dl>

        <button type="button" onClick={save} disabled={saving} className="btn-primary inline-flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
          <Save size={15} />{saving ? 'Saving…' : 'Save'}
        </button>
      </section>
    </div>
  );
}
