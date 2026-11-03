'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from '../components/AppShell';
import { useLanguage } from '../components/LanguageProvider';
import { RefreshCw, XCircle, Anchor, ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from 'lucide-react';

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
  const [speed, setSpeed] = useState(telemetry.speed || 0);
  // Target perintah dapat dipilih Robot ID, bukan hanya robot dari telemetry (kontrak §6).
  const [targetId, setTargetId] = useState('');

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

  // Robot target = pilihan dropdown, fallback telemetry; misi aktif diambil dari data robot target.
  const target = targetId || telemetry.robotId;
  const targetRobot = robots.find((r) => r.robotId === target);
  const targetStatus = targetRobot?.status || telemetry.status;
  const targetMissionId = targetRobot?.activeMissionId
    || (target === telemetry.robotId ? telemetry.activeMissionId : undefined);
  const targetOptions = robots.length ? robots : [{ robotId: telemetry.robotId, name: telemetry.name }];

  const send = async (command: 'CMD_CANCEL_MISSION' | 'CMD_RETURN_TO_DOCK' | 'CMD_SET_SPEED' | 'CMD_TELEOP_DRIVE', params: Record<string, unknown>) => {
    setError('');
    setSending(true);
    setIssuedId(null);
    try {
      const res = await request(`robots/${target}/commands`, {
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

  // WASD keyboard teleop — refs agar listener dipasang sekali (guard = disabled tombol: IDLE + bukan sedang kirim).
  const sendRef = useRef(send);
  sendRef.current = send;
  const wasdGate = useRef({ idle: targetStatus === 'IDLE', sending });
  wasdGate.current = { idle: targetStatus === 'IDLE', sending };
  useEffect(() => {
    const KEYS: Record<string, Partial<{ linear: number; angular: number }>> = {
      w: { linear: 1, angular: 0 }, s: { linear: -1, angular: 0 },
      a: { linear: 0, angular: 1 }, d: { linear: 0, angular: -1 },
    };
    const typing = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    };
    const drive = (params: Record<string, unknown>) => {
      if (wasdGate.current.idle && !wasdGate.current.sending) sendRef.current('CMD_TELEOP_DRIVE', params);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || typing(e)) return;
      const k = KEYS[e.key.toLowerCase()];
      if (k) drive({ linear: k.linear ?? 0, angular: k.angular ?? 0 });
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.repeat || typing(e)) return;
      if (KEYS[e.key.toLowerCase()]) drive({ linear: 0, angular: 0 });
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onUp);
    };
  }, []);

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

      {/* KPI armada (mockup monitoring-robots): total, pengiriman aktif, rata-rata baterai, online */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: t.fleetTotal, value: String(robots.length), cls: 'txt-main' },
          { label: t.fleetMissions, value: String(robots.filter((robot) => robot.activeMissionId).length), cls: 'text-accent' },
          { label: t.fleetAvgBattery, value: `${(robots.reduce((sum, robot) => sum + Number(robot.battery || 0), 0) / Math.max(robots.length, 1)).toFixed(0)}%`, cls: 'txt-main' },
          { label: t.fleetOnline, value: String(robots.filter((robot) => robot.status !== 'OFFLINE').length), cls: 'text-success' },
        ].map((kpi) => (
          <div key={kpi.label} className="glass-panel card-hover p-4">
            <p className="text-xs txt-sec">{kpi.label}</p>
            <p className={`text-2xl font-bold tabular-nums mt-1 ${kpi.cls}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

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
            <label className="text-xs txt-sec shrink-0" htmlFor="robot-target">{t.targetRobot}</label>
            <select
              id="robot-target"
              className="bg-input border border-border-base rounded-xl px-3 py-2 text-sm txt-main"
              value={target}
              onChange={(e) => setTargetId(e.target.value)}
            >
              {targetOptions.map((r) => (
                <option key={r.robotId} value={r.robotId}>
                  {r.name ? `${r.name} (${r.robotId})` : r.robotId}
                </option>
              ))}
            </select>
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
            <dd className="mt-2">
              <div className="battery-track" role="meter" aria-valuenow={Math.round(telemetry.battery)} aria-valuemin={0} aria-valuemax={100} aria-label={dict.header.battery}>
                <div
                  className={`battery-fill ${telemetry.battery <= 20 ? 'low' : telemetry.battery <= 40 ? 'mid' : ''}`}
                  style={{ width: `${Math.min(100, Math.max(0, telemetry.battery))}%` }}
                />
              </div>
            </dd>
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
            <dd className="font-mono text-xs txt-main mt-1 break-all">{targetMissionId || t.none}</dd>
          </div>
          <div className="bg-elevated rounded-xl p-3 border border-border-base">
            <dt className="txt-sec text-xs">{t.queueLength}</dt>
            <dd className={`font-mono mt-1 ${telemetry.queueLength ? 'text-warning' : 'txt-main'}`}>
              {telemetry.queueLength ?? 0}
            </dd>
          </div>
        </dl>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            className="btn-primary inline-flex items-center gap-2"
            disabled={!targetMissionId || sending}
            title={targetMissionId ? undefined : t.noActiveMission}
            onClick={() => send('CMD_CANCEL_MISSION', { missionId: targetMissionId })}
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

        <div className="border-t border-border-base pt-4 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-xs txt-sec" htmlFor="robot-speed">{t.speed}</label>
            <input id="robot-speed" type="number" min="0" max="2" step="0.1" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="input-field w-24 font-mono text-xs" />
            <button type="button" className="btn-secondary text-xs" disabled={sending} onClick={() => send('CMD_SET_SPEED', { speed })}>{t.setSpeed}</button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {[
              ['forward', ArrowUp, { linear: 1, angular: 0 }],
              ['left', ArrowLeft, { linear: 0, angular: 1 }],
              ['stop', XCircle, { linear: 0, angular: 0 }],
              ['right', ArrowRight, { linear: 0, angular: -1 }],
              ['reverse', ArrowDown, { linear: -1, angular: 0 }],
            ].map(([key, Icon, params]) => (
              <button key={key as string} type="button" className="btn-secondary inline-flex items-center gap-1 text-xs" disabled={sending || targetStatus !== 'IDLE'} onClick={() => send('CMD_TELEOP_DRIVE', params as Record<string, unknown>)}>
                {React.createElement(Icon as React.ElementType, { size: 14 })} {key as string}
              </button>
            ))}
          </div>
          <p className="text-[11px] txt-sec">{t.wasdHint}</p>
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
