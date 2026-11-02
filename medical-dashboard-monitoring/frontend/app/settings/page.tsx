'use client';

import React, { useEffect, useState } from 'react';
import { useApp } from '../components/AppShell';
import { useLanguage } from '../components/LanguageProvider';
import { RefreshCw, Save, Settings, Wifi } from 'lucide-react';

const DEFAULT_SIMRS_URL = 'http://127.0.0.1:3000/api/v1';
const DEFAULT_WS_URL = 'ws://127.0.0.1:8081/ws/v1/deliveries';

type ConnectionState = { simrsUrl: string; wsUrl: string; wsEnabled: boolean };

export default function SettingsPage() {
  const { request } = useApp();
  const { dict } = useLanguage();
  const t = dict.settings;
  const [saved, setSaved] = useState<ConnectionState>({ simrsUrl: DEFAULT_SIMRS_URL, wsUrl: DEFAULT_WS_URL, wsEnabled: false });
  const [draft, setDraft] = useState(saved);
  const [testing, setTesting] = useState(false);
  const [tested, setTested] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem('nevo_connection_settings');
    if (!raw) return;
    try {
      const next = { ...saved, ...JSON.parse(raw) } as ConnectionState;
      setSaved(next);
      setDraft(next);
    } catch { /* ignore malformed local settings */ }
  }, []);

  const update = (patch: Partial<ConnectionState>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setTested(false);
    setMessage(null);
  };

  const testConnection = async () => {
    setTesting(true);
    setTested(false);
    setMessage(null);
    try {
      new URL(draft.simrsUrl);
      new URL(draft.wsUrl);
      await request('integrations/simrs/status');
      setTested(true);
      setMessage({ type: 'success', text: 'Connection test passed. Save to apply these settings.' });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Connection test failed.' });
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    try {
      const response = await fetch('/api/ws/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: draft.wsEnabled ? 'turnOn' : 'turnOff' }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to update relay session.');
      localStorage.setItem('nevo_connection_settings', JSON.stringify(draft));
      setSaved(draft);
      setTested(false);
      window.dispatchEvent(new Event('nevo:ws-session-changed'));
      setMessage({ type: 'success', text: `Connection settings saved. Relay ${data.conn?.on ? 'ON' : 'OFF'}.` });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Unable to save connection settings.' });
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="glass-panel p-6">
        <h1 className="text-xl font-bold txt-main flex items-center gap-2"><Settings className="text-accent" size={22} />{t.title}</h1>
        <p className="text-xs txt-sec mt-1">Configure the SIMRS and robot WebSocket connections.</p>
      </div>

      <section className="glass-panel p-6 space-y-5">
        <div className="flex items-center gap-2 border-b border-base pb-3"><Wifi size={17} className="text-accent" /><h2 className="font-bold text-sm txt-main">Connection endpoints</h2></div>
        {message && <p className={`text-xs ${message.type === 'success' ? 'text-success' : 'text-error'}`}>{message.text}</p>}
        <label className="block space-y-1.5 text-xs txt-sec">
          <span>SIMRS URL</span>
          <input value={draft.simrsUrl} onChange={(e) => update({ simrsUrl: e.target.value })} className="input-field w-full font-mono" />
        </label>
        <label className="block space-y-1.5 text-xs txt-sec">
          <span>WebSocket URL</span>
          <input value={draft.wsUrl} onChange={(e) => update({ wsUrl: e.target.value })} className="input-field w-full font-mono" />
        </label>
        <label className="flex items-center gap-3 text-sm txt-main cursor-pointer">
          <input type="checkbox" checked={draft.wsEnabled} onChange={(e) => update({ wsEnabled: e.target.checked })} className="accent-accent" />
          WebSocket enabled
        </label>
        <div className="flex flex-wrap gap-3 pt-2">
          <button type="button" onClick={testConnection} disabled={testing} className="btn-secondary inline-flex items-center gap-2 disabled:opacity-50">
            <RefreshCw size={15} className={testing ? 'animate-spin' : ''} />{testing ? 'Testing…' : 'Test Connection'}
          </button>
          <button type="button" onClick={save} disabled={!tested} className="btn-primary inline-flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
            <Save size={15} />Save Connection
          </button>
        </div>
        <p className="text-[11px] txt-sec">Test Connection does not save changes. Save Connection is enabled only after a successful test.</p>
      </section>
    </div>
  );
}
