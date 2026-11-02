'use client';

import React, { useEffect, useState } from 'react';
import { useApp } from '../../components/AppShell';
import { useLanguage } from '../../components/LanguageProvider';
import { Cpu, Bot, RefreshCw, CheckCircle2, AlertOctagon } from 'lucide-react';

type Row = {
  robotId: string;
  name: string;
  model?: string | null;
  registeredAt?: string | null;
};

const FIELD =
  'w-full bg-input border border-base rounded-lg px-3.5 py-2.5 text-sm txt-main outline-none focus:border-accent transition-colors';

export default function RobotRegistryPage() {
  const { user, request } = useApp();
  const { dict, language } = useLanguage();
  const t = dict.robotRegistry;
  const tc = dict.common;
  const locale = language === 'id' ? 'id-ID' : 'en-US';
  const isAdmin = (user?.role || '').toUpperCase() === 'ADMIN';

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form registrasi (kontrak §7: POST /robots, role ADMIN).
  const [showAdd, setShowAdd] = useState(false);
  const [robotId, setRobotId] = useState('');
  const [robotName, setRobotName] = useState('');
  const [model, setModel] = useState('');
  const [saving, setSaving] = useState(false);

  const flash = (fn: (v: string | null) => void, msg: string | null) => {
    fn(msg);
    if (msg) setTimeout(() => fn(null), 4000);
  };

  const fetchRegistry = () => {
    setLoading(true);
    request('robots/registry')
      .then((data: Row[]) => setRows(Array.isArray(data) ? data : []))
      .catch((err) => flash(setError, err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchRegistry();
  }, []);

  const submitAdd = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);
    request('robots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ robotId, name: robotName, model: model || undefined }),
    })
      .then(() => {
        flash(setSuccess, t.registeredSuccess);
        setShowAdd(false);
        setRobotId('');
        setRobotName('');
        setModel('');
        fetchRegistry();
      })
      .catch((err) => flash(setError, err.message))
      .finally(() => setSaving(false));
  };

  const fmtDate = (value: string | null | undefined) =>
    value ? new Date(value).toLocaleString(locale) : '—';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass-panel p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold txt-main flex items-center gap-2">
            <Cpu className="text-accent" size={24} />
            {t.title}
          </h2>
          <p className="text-xs txt-sec mt-1">{t.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button
              onClick={() => setShowAdd((v) => !v)}
              className="btn-primary flex items-center gap-1.5 text-xs"
            >
              <Bot size={14} /> {t.addRobot}
            </button>
          )}
          <button
            onClick={fetchRegistry}
            disabled={loading}
            className="btn-secondary inline-flex items-center gap-2 text-xs"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            {tc.refresh}
          </button>
        </div>
      </div>

      {error && (
        <div className="glass-panel p-4 border-error/40 bg-error/5 flex items-start gap-2">
          <AlertOctagon size={15} className="text-error shrink-0 mt-0.5" />
          <p className="text-xs text-error">{error}</p>
        </div>
      )}
      {success && (
        <div className="glass-panel p-4 border-success/40 bg-success/5 flex items-start gap-2">
          <CheckCircle2 size={15} className="text-success shrink-0 mt-0.5" />
          <p className="text-xs text-success">{success}</p>
        </div>
      )}

      {/* Form registrasi */}
      {isAdmin && showAdd && (
        <div className="glass-panel p-6">
          <form onSubmit={submitAdd} className="grid md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs txt-sec font-medium" htmlFor="registry-robot-id">{t.robotId}</label>
              <input
                id="registry-robot-id"
                value={robotId}
                onChange={(e) => setRobotId(e.target.value)}
                required
                minLength={3}
                maxLength={64}
                pattern="[A-Za-z0-9_.\-]+"
                className={FIELD}
                placeholder="NEVO-A1-03"
              />
              <p className="text-[10px] txt-sec">{t.robotIdHint}</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs txt-sec font-medium" htmlFor="registry-robot-name">{t.robotName}</label>
              <input
                id="registry-robot-name"
                value={robotName}
                onChange={(e) => setRobotName(e.target.value)}
                required
                maxLength={150}
                className={FIELD}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs txt-sec font-medium" htmlFor="registry-robot-model">{t.model}</label>
              <input
                id="registry-robot-model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                maxLength={100}
                className={FIELD}
              />
              <p className="text-[10px] txt-sec">{t.modelHint}</p>
            </div>
            <div className="md:col-span-3 flex items-center gap-3">
              <button type="submit" disabled={saving} className="btn-primary justify-center">
                {saving ? tc.loading : t.addRobot}
              </button>
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="px-4 py-2.5 rounded-lg text-xs font-medium bg-elevated txt-sec hover:bg-accent-muted transition-colors"
              >
                {tc.cancel}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tabel registry */}
      <div className="glass-panel p-6 space-y-4">
        {loading ? (
          <p className="text-sm txt-sec text-center py-10">{tc.loading}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm txt-sec text-center py-10">{t.tableEmpty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-base txt-sec">
                  <th className="py-3 px-4">{t.robotId}</th>
                  <th className="py-3 px-4">{t.robotName}</th>
                  <th className="py-3 px-4">{t.model}</th>
                  <th className="py-3 px-4">{t.registeredAt}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-base/60">
                {rows.map((r) => (
                  <tr key={r.robotId} className="hover:bg-elevated/40 transition-colors">
                    <td className="py-3 px-4">
                      <span className="font-mono txt-main">{r.robotId}</span>
                    </td>
                    <td className="py-3 px-4 txt-main">{r.name}</td>
                    <td className="py-3 px-4 txt-sec font-mono">{r.model || '—'}</td>
                    <td className="py-3 px-4 txt-sec">{fmtDate(r.registeredAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
