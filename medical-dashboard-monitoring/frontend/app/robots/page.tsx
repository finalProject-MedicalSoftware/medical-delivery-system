'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../components/AppShell';
import { useLanguage } from '../components/LanguageProvider';
import { RefreshCw, XCircle, Anchor } from 'lucide-react';

export default function RobotsPage() {
  const { request, telemetry, lastCommandResult } = useApp();
  const { dict, language } = useLanguage();
  const t = dict.robots;
  const locale = language === 'id' ? 'id-ID' : 'en-US';

  const [robots, setRobots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [issuedId, setIssuedId] = useState<string | null>(null);
  const [dockId, setDockId] = useState('');
  const [docks, setDocks] = useState<{ id: string; name: string }[]>([]);

  const loadRobots = useCallback(() => {
    setLoading(true);
    request('robots')
      .then((list: any[]) => setRobots(list || []))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [request]);

  useEffect(() => {
    loadRobots();
    request('mappings')
      .then(async (mappings: any[]) => {
        // ponytail: hanya peta ROS aktif pertama; tambah pemilih peta kalau dok beda antar peta.
        const map = (mappings || []).filter((m) => m.kind === 'ROS' && m.active)[0];
        if (!map) return;
        const wps = await request(`maps/${map.id}/waypoints`);
        setDocks((wps || [])
          .filter((w: any) => w.enabled)
          .map((w: any) => ({ id: w.id, name: w.room_code ? `${w.name} (${w.room_code})` : w.name })));
      })
      .catch(() => { /* tanpa dok: tombol kembali-ke-dok tetap nonaktif */ });
  }, [loadRobots, request]);

  const result = lastCommandResult && issuedId && lastCommandResult.commandId === issuedId
    ? lastCommandResult
    : null;

  const send = async (command: 'CMD_CANCEL_MISSION' | 'CMD_RETURN_TO_DOCK', params: Record<string, unknown>) => {
    setError('');
    setSending(true);
    setIssuedId(null);
    try {
      const res = await request('robots/NEVO-01/commands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, params }),
      });
      setIssuedId(res?.commandId ?? null);
      if (!res?.commandId) setError(t.resultRejected);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  };

  const statusClass = (s: string) =>
    s === 'IDLE' || s === 'CHARGING'
      ? 'status-success'
      : s === 'ERROR' || s === 'OFFLINE'
        ? 'status-danger'
        : 'status-warning';

  const others = robots.filter((r) => r.robotId !== telemetry.robotId);
  const reasonText: Record<string, string> = {
    ROBOT_BUSY: t.reasonBusy,
    UNKNOWN_ROBOT: t.reasonUnknown,
    INVALID_PARAMS: t.reasonInvalid,
    MODE_NOT_SUPPORTED: t.reasonMode,
  };

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-bold txt-main">{t.title}</h1>
          <p className="text-sm txt-sec mt-1">{t.subtitle}</p>
        </div>
        <button className="btn-secondary inline-flex items-center gap-2" onClick={loadRobots} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          {dict.common.refresh}
        </button>
      </div>

      {error && <div className="glass-panel p-3 text-sm text-error">{error}</div>}

      {issuedId && (
        <div className={`glass-panel p-4 text-sm ${!result ? 'txt-sec' : result.result === 'OK' ? 'text-success' : 'text-error'}`}>
          {!result
            ? t.pending
            : result.result === 'OK'
              ? t.resultOk
              : `${t.resultRejected}: ${reasonText[result.reason] || result.reason || '—'}`}
        </div>
      )}

      <section className="glass-panel p-4 md:p-6 space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="font-semibold txt-main truncate">{telemetry.name}</h2>
            <span className="font-mono text-xs txt-sec shrink-0">{telemetry.robotId}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`status-pill ${telemetry.simulated ? 'status-warning' : 'status-success'}`}>
              {telemetry.simulated ? dict.common.simulated : dict.common.live}
            </span>
            <span className={`status-pill ${statusClass(telemetry.status)}`}>{telemetry.status}</span>
          </div>
        </div>

        <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div className="bg-elevated rounded-xl p-3 border border-border-base">
            <dt className="txt-sec text-xs">{dict.header.battery}</dt>
            <dd className="font-mono txt-main mt-1">{telemetry.battery.toFixed(1)}%</dd>
          </div>
          <div className="bg-elevated rounded-xl p-3 border border-border-base">
            <dt className="txt-sec text-xs">{dict.header.pose}</dt>
            <dd className="font-mono txt-main mt-1">({telemetry.pose.x.toFixed(2)}, {telemetry.pose.y.toFixed(2)})</dd>
          </div>
          <div className="bg-elevated rounded-xl p-3 border border-border-base">
            <dt className="txt-sec text-xs">{t.speed}</dt>
            <dd className="font-mono txt-main mt-1">{telemetry.speed.toFixed(2)} m/s</dd>
          </div>
          <div className="bg-elevated rounded-xl p-3 border border-border-base">
            <dt className="txt-sec text-xs">{t.activeMission}</dt>
            <dd className="font-mono text-xs txt-main mt-1 break-all">{telemetry.activeMissionId || t.none}</dd>
          </div>
        </dl>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            className="btn-primary inline-flex items-center gap-2"
            disabled={!telemetry.activeMissionId || sending}
            title={telemetry.activeMissionId ? undefined : t.noActiveMission}
            onClick={() => send('CMD_CANCEL_MISSION', { missionId: telemetry.activeMissionId })}
          >
            <XCircle size={16} />
            {t.cancelMission}
          </button>

          <select
            className="bg-input border border-border-base rounded-xl px-3 py-2 text-sm txt-main"
            value={dockId}
            onChange={(e) => setDockId(e.target.value)}
            aria-label={t.dockPlaceholder}
          >
            <option value="">{t.dockPlaceholder}</option>
            {docks.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <button
            type="button"
            className="btn-secondary inline-flex items-center gap-2"
            disabled={!dockId || sending}
            onClick={() => send('CMD_RETURN_TO_DOCK', { waypointId: dockId })}
          >
            <Anchor size={16} />
            {t.returnToDock}
          </button>
        </div>

        <p className="text-xs txt-sec">
          {telemetry.simulated ? `${t.simNotice} · ` : ''}
          {t.lastSeen}: {new Date(telemetry.lastSeen).toLocaleTimeString(locale)}
        </p>
      </section>

      {others.length > 0 && (
        <section className="glass-panel divide-y divide-border-base">
          {others.map((r) => (
            <div key={r.robotId} className="px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-mono text-sm txt-main shrink-0">{r.robotId}</span>
                <span className="text-sm txt-sec truncate">{r.name}</span>
              </div>
              <span className="status-pill status-danger shrink-0">{dict.common.offline}</span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
