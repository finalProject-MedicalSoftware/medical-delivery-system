'use client';

/**
 * Pengaturan koneksi runtime (redesain 4B, FEATURE_MAP_4B.md):
 * semuanya disimpan server-side via POST /api/ws/session `setConnection`
 * (endpoints + wsToken) — tanpa localStorage, tanpa hardcoded env.
 * Test Connection hanya validasi sintaks URL; konektivitas nyata terlihat
 * dari panel status relay setelah disimpan.
 */
import React, { useEffect, useState } from 'react';
import { RefreshCw, Save, Settings, Wifi } from 'lucide-react';

type Endpoints = { backendUrl: string; wsUrl: string };
type SessionView = {
  conn: { on: boolean; lockBy: string | null; authedAt: number };
  tokenPresent: boolean;
  tokenPrefix: string | null;
  wsTarget: string;
  relayPath: string;
  endpoints: Endpoints;
};

const validHttp = (s: string) => { try { const u = new URL(s); return u.protocol === 'http:' || u.protocol === 'https:'; } catch { return false; } };
const validWs = (s: string) => { try { const u = new URL(s); return u.protocol === 'ws:' || u.protocol === 'wss:'; } catch { return false; } };

export default function SettingsPage() {
  const [view, setView] = useState<SessionView | null>(null);
  const [draft, setDraft] = useState<Endpoints & { wsToken: string }>({ backendUrl: '', wsUrl: '', wsToken: '' });
  const [draftEnabled, setDraftEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tested, setTested] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const load = async () => {
    try {
      const res = await fetch('/api/ws/session');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to load connection settings.');
      applyView(data as SessionView);
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Unable to load connection settings.' });
    }
  };

  const applyView = (v: SessionView) => {
    setView(v);
    setDraft({ backendUrl: v.endpoints?.backendUrl ?? '', wsUrl: v.endpoints?.wsUrl ?? '', wsToken: '' });
    setDraftEnabled(!!v.conn?.on);
  };

  useEffect(() => { load(); }, []);

  const update = (patch: Partial<Endpoints & { wsToken: string }>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setTested(false);
    setMessage(null);
  };

  const testConnection = () => {
    setMessage(null);
    if (!validHttp(draft.backendUrl) || !validWs(draft.wsUrl)) {
      setMessage({ type: 'error', text: 'Backend URL must be http(s)://… and WebSocket URL must be ws(s)://…' });
      return;
    }
    setTested(true);
    setMessage({ type: 'success', text: 'URL format valid. Save to apply; live connectivity shows in the relay status below.' });
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const post = async (body: Record<string, unknown>) => {
        const res = await fetch('/api/ws/session', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Unable to update connection settings.');
        return data as SessionView & { ok: boolean };
      };
      // 1) Simpan endpoints + token (runtime config), 2) selaraskan relay on/off.
      const savedView = await post({ action: 'setConnection', endpoints: { backendUrl: draft.backendUrl, wsUrl: draft.wsUrl }, wsToken: draft.wsToken });
      const finalView = savedView.conn.on !== draftEnabled
        ? await post({ action: draftEnabled ? 'turnOn' : 'turnOff' })
        : savedView;
      applyView(finalView);
      window.dispatchEvent(new Event('nevo:ws-session-changed'));
      setMessage({ type: 'success', text: `Connection settings saved. Relay ${finalView.conn.on ? 'ON' : 'OFF'}.` });
      setTested(false);
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Unable to save connection settings.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="glass-panel p-6">
        <h1 className="text-xl font-bold txt-main flex items-center gap-2"><Settings className="text-accent" size={22} />Connection settings</h1>
        <p className="text-xs txt-sec mt-1">Configure the backend REST API and the robot WebSocket gateway (medical-ws). Stored server-side for the whole session.</p>
      </div>

      <section className="glass-panel p-6 space-y-5">
        <div className="flex items-center gap-2 border-b border-border-base pb-3"><Wifi size={17} className="text-accent" /><h2 className="font-bold text-sm txt-main">Connection endpoints</h2></div>
        {message && <p className={`text-xs ${message.type === 'success' ? 'text-success' : 'text-error'}`}>{message.text}</p>}
        <label className="block space-y-1.5 text-xs txt-sec">
          <span>Backend URL (REST API)</span>
          <input value={draft.backendUrl} onChange={(e) => update({ backendUrl: e.target.value })} placeholder="http://127.0.0.1:8082" className="input-field w-full font-mono" />
        </label>
        <label className="block space-y-1.5 text-xs txt-sec">
          <span>WebSocket URL (medical-ws gateway)</span>
          <input value={draft.wsUrl} onChange={(e) => update({ wsUrl: e.target.value })} placeholder="ws://127.0.0.1:8081/ws/v1/deliveries" className="input-field w-full font-mono" />
        </label>
        <label className="block space-y-1.5 text-xs txt-sec">
          <span>Gateway token (Bearer) — leave blank to keep the current one</span>
          <input type="password" value={draft.wsToken} onChange={(e) => update({ wsToken: e.target.value })} placeholder="ws://… token" className="input-field w-full font-mono" />
        </label>
        {view && (
          <dl className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-elevated rounded-xl p-3 border border-border-base">
              <dt className="txt-sec">Gateway token</dt>
              <dd className="font-mono txt-main mt-1">{view.tokenPresent ? `${view.tokenPrefix} (${view.conn.on ? 'in use' : 'saved'})` : 'not set'}</dd>
            </div>
            <div className="bg-elevated rounded-xl p-3 border border-border-base">
              <dt className="txt-sec">Relay target</dt>
              <dd className="font-mono txt-main mt-1">{view.wsTarget}</dd>
            </div>
          </dl>
        )}
        <label className="flex items-center gap-3 text-sm txt-main cursor-pointer">
          <input type="checkbox" checked={draftEnabled} onChange={(e) => { setDraftEnabled(e.target.checked); }} className="accent-accent" />
          WebSocket relay enabled (dashboard receives live events)
        </label>
        <div className="flex flex-wrap gap-3 pt-2">
          <button type="button" onClick={testConnection} className="btn-secondary inline-flex items-center gap-2">
            <RefreshCw size={15} />Test Connection
          </button>
          <button type="button" onClick={save} disabled={!tested || saving} className="btn-primary inline-flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
            <Save size={15} />{saving ? 'Saving…' : 'Save Connection'}
          </button>
        </div>
        <p className="text-[11px] txt-sec">Test Connection checks URL syntax only. Save Connection applies endpoints + token to the BFF relay (Admin only) and restarts the relay with the new configuration.</p>
      </section>
    </div>
  );
}
