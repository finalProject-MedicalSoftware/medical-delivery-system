'use client';

/**
 * /robots — kendali robot via gateway WS (protokol TIFA) melalui BFF:
 * - roster robot dari SSE /api/ws/stream (burst SSE_ROSTER + frame READY/POSITION/BATTERY/ERROR),
 * - teleop hold (tombol + WASD) 10Hz → POST /api/ws/command {code:'TELEOP',data:{linear,angular}},
 * - kontrol mapping MAPPING_START/STOP/SAVE/FLAG + MAP_SELECTED (map_id integer).
 * Tanpa useApp().request/telemetry — semua data live dari relay, bukan simulator backend.
 */
import React, { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../components/LanguageProvider';
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from 'lucide-react';

type RosterEntry = { robot_id: string; lastCode: string; lastSeen: number; status: string; position: any; battery: number | null };
type Vec = { linear: number; angular: number };

/** Merge frame TIFA uplink ke roster (mirror trackRoster di lib/ws-relay). */
function applyFrame(list: RosterEntry[], f: any): RosterEntry[] {
  const id = f?.data?.robot_id;
  if (typeof id !== 'string' || !id) return list;
  const old = list.find((x) => x.robot_id === id);
  const next: RosterEntry = {
    robot_id: id,
    lastCode: f.code,
    lastSeen: Date.now(),
    status: old?.status || 'UNKNOWN',
    position: old?.position ?? null,
    battery: old?.battery ?? null,
  };
  const d = f.data || {};
  if (f.code === 'POSITION') next.position = d;
  if (f.code === 'BATTERY') next.battery = d.battery_percent ?? d.battery ?? null;
  if (f.code === 'READY') next.status = d.status || 'READY';
  if (f.code === 'ERROR') next.status = d.status || 'ERROR';
  return [...list.filter((x) => x.robot_id !== id), next].sort((a, b) => a.robot_id.localeCompare(b.robot_id));
}

export default function RobotsPage() {
  const { dict, language } = useLanguage();
  const t = dict.robots;
  const locale = language === 'id' ? 'id-ID' : 'en-US';

  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [streamError, setStreamError] = useState('');
  const [actionError, setActionError] = useState('');
  const [targetId, setTargetId] = useState('');
  const [mapId, setMapId] = useState('');
  const [sending, setSending] = useState(false);
  // Registry (backend) — robot terdaftar ikut masuk pilihan meski belum online.
  const [registry, setRegistry] = useState<{ robotId: string; name: string }[]>([]);

  // SSE roster — gateway dipegang relay BFF; halaman hanya konsumen event.
  useEffect(() => {
    const es = new EventSource('/api/ws/stream?channels=all');
    es.onopen = () => setStreamError('');
    es.onerror = () => setConnected(false); // EventSource auto-reconnect sendiri.
    es.onmessage = (ev) => {
      let item: any;
      try { item = JSON.parse(ev.data); } catch { return; }
      if (item?.type === 'SSE_INIT') { setConnected(true); setStreamError(''); }
      else if (item?.type === 'SSE_ROSTER') setRoster(item.robots || []);
      else if (item?.code && item.data?.robot_id) setRoster((cur) => applyFrame(cur, item));
      else if (item?.error) setStreamError(item.error);
    };
    return () => es.close();
  }, []);

  // Ambil robot terdaftar sekali saat mount — dropdown target = roster live ∪ registry.
  useEffect(() => {
    fetch('/api/proxy/robots/registry', { credentials: 'include', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setRegistry(Array.isArray(data) ? data : []))
      .catch(() => {}); // registry gagal → fallback roster live saja (ponytail: tanpa retry UI)
  }, []);

  const target = roster.find((r) => r.robot_id === targetId) || null;

  const postCommand = async (code: string, data: Record<string, unknown>) => {
    setActionError('');
    setSending(true);
    try {
      const payload = { code, data: targetId ? { ...data, robot_id: targetId } : data };
      const res = await fetch('/api/ws/command', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) setActionError(`${t.sendFail}: ${body.error || res.status}`);
    } finally {
      setSending(false);
    }
  };

  // ---- teleop 10Hz: sumber kombinasi linear/angular dari tombol hold + WASD ----
  const held = useRef(new Map<string, Vec>());
  const lastSent = useRef<Vec>({ linear: 0, angular: 0 });
  const sendRef = useRef(postCommand);
  sendRef.current = postCommand;

  const addVec = (id: string, v: Vec) => held.current.set(id, v);
  const removeVec = (id: string) => {
    if (!held.current.has(id)) return;
    held.current.delete(id);
    if (held.current.size === 0) postCommandRefStop();
  };
  const postCommandRefStop = () => { sendRef.current('TELEOP', { linear: 0, angular: 0 }); };

  useEffect(() => {
    const KEYS = ['w', 's', 'a', 'd'];
    const VECS: Record<string, Vec> = {
      w: { linear: 1, angular: 0 }, s: { linear: -1, angular: 0 },
      a: { linear: 0, angular: 1 }, d: { linear: 0, angular: -1 },
    };
    const typing = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || typing(e)) return;
      const k = e.key.toLowerCase();
      if (KEYS.includes(k)) addVec(k, VECS[k]);
    };
    const onUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (KEYS.includes(k)) removeVec(k);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onUp);
    // Ticker 10Hz: kirim kombinasi aktif; transisi ke nol dikirim sekali di sini
    // bila terjadi langsung dari ticker (keyup sudah kirim stop sendiri).
    const timer = setInterval(() => {
      const cur: Vec = { linear: 0, angular: 0 };
      for (const v of held.current.values()) { cur.linear += v.linear; cur.angular += v.angular; }
      cur.linear = Math.max(-1, Math.min(1, cur.linear));
      cur.angular = Math.max(-1, Math.min(1, cur.angular));
      const last = lastSent.current;
      if (cur.linear !== last.linear || cur.angular !== last.angular) {
        lastSent.current = cur;
        sendRef.current('TELEOP', cur);
      }
    }, 100);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onUp);
      clearInterval(timer);
    };
  }, []);

  const statusClass = (s: string) =>
    s === 'READY' || s === 'IDLE' || s === 'CHARGING'
      ? 'status-success'
      : s === 'ERROR' || s === 'OFFLINE'
        ? 'status-danger'
        : 'status-warning';

  const avgBattery = roster.reduce((sum, r) => sum + Number(r.battery ?? 0), 0) / Math.max(roster.length, 1);
  const onlineCount = roster.filter((r) => r.status !== 'ERROR' && r.status !== 'OFFLINE').length;
  const pos = target?.position && Number.isFinite(Number(target.position?.x)) ? target.position : null;

  // Tombol hold: pointerdown mulai, lepas/batal/keluar area = stop (via removeVec).
  const holdBtn = (id: string, Icon: React.ElementType, v: Vec) => (
    <button
      key={id}
      type="button"
      className="btn-secondary inline-flex items-center gap-1 text-xs"
      disabled={!targetId}
      onPointerDown={() => addVec(id, v)}
      onPointerUp={() => removeVec(id)}
      onPointerLeave={() => removeVec(id)}
      onPointerCancel={() => removeVec(id)}
      aria-label={id}
    >
      {React.createElement(Icon, { size: 14 })} {id}
    </button>
  );

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-bold txt-main">{t.title}</h1>
          <p className="text-sm txt-sec mt-1">{t.subtitle}</p>
        </div>
        <span className={`status-pill ${connected ? 'status-success' : 'status-danger'}`}>
          {connected ? dict.common.live : dict.common.disconnected}
        </span>
      </div>

      {streamError && <div className="glass-panel p-3 text-sm text-error">SSE: {streamError} — atur UI ID di /settings lalu aktifkan relay.</div>}
      {actionError && <div className="glass-panel p-3 text-sm text-error">{actionError}</div>}

      {/* KPI armada dari roster WS (total, online, rata-rata baterai) */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: t.fleetTotal, value: String(roster.length), cls: 'txt-main' },
          { label: t.fleetOnline, value: String(onlineCount), cls: 'text-success' },
          { label: t.fleetAvgBattery, value: `${avgBattery.toFixed(0)}%`, cls: roster.some((r) => (r.battery ?? 100) <= 20) ? 'text-error' : 'txt-main' },
        ].map((kpi) => (
          <div key={kpi.label} className="glass-panel card-hover p-4">
            <p className="text-xs txt-sec">{kpi.label}</p>
            <p className={`text-2xl font-bold tabular-nums mt-1 ${kpi.cls}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      <section className="glass-panel p-4 md:p-6 space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <label className="text-xs txt-sec shrink-0" htmlFor="robot-target">{t.targetRobot}</label>
            <select
              id="robot-target"
              className="bg-input border border-border-base rounded-xl px-3 py-2 text-sm txt-main"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
            >
              <option value="">— {t.none}</option>
              {roster.map((r) => (
                <option key={r.robot_id} value={r.robot_id}>{r.robot_id}</option>
              ))}
              {registry
                .filter((x) => !roster.some((r) => r.robot_id === x.robotId))
                .map((x) => (
                  <option key={x.robotId} value={x.robotId}>{x.robotId} — {dict.common.offline}</option>
                ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className={`status-pill ${statusClass(target?.status || '')}`}>{target?.status || dict.common.unknown}</span>
          </div>
        </div>

        <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div className="bg-elevated rounded-xl p-3 border border-border-base">
            <dt className="txt-sec text-xs">{t.fleetAvgBattery}</dt>
            <dd className="font-mono txt-main mt-1">{target?.battery != null ? `${target.battery}%` : '—'}</dd>
            {target?.battery != null && (
              <dd className="mt-2">
                <div className="battery-track" role="meter" aria-valuenow={Math.round(target.battery)} aria-valuemin={0} aria-valuemax={100} aria-label={t.fleetAvgBattery}>
                  <div
                    className={`battery-fill ${target.battery <= 20 ? 'low' : target.battery <= 40 ? 'mid' : ''}`}
                    style={{ width: `${Math.min(100, Math.max(0, target.battery))}%` }}
                  />
                </div>
              </dd>
            )}
          </div>
          <div className="bg-elevated rounded-xl p-3 border border-border-base">
            <dt className="txt-sec text-xs">{dict.header.pose}</dt>
            <dd className="font-mono text-xs txt-main mt-1">{pos ? `(${Number(pos.x).toFixed(2)}, ${Number(pos.y).toFixed(2)})` : '—'}</dd>
          </div>
          <div className="bg-elevated rounded-xl p-3 border border-border-base">
            <dt className="txt-sec text-xs">{t.lastSeen}</dt>
            <dd className="font-mono text-xs txt-main mt-1">{target?.lastSeen ? new Date(target.lastSeen).toLocaleTimeString(locale) : '—'}</dd>
          </div>
          <div className="bg-elevated rounded-xl p-3 border border-border-base">
            <dt className="txt-sec text-xs">Frame</dt>
            <dd className="font-mono text-xs txt-main mt-1">{target?.lastCode || '—'}</dd>
          </div>
        </dl>

        {/* Teleop: tombol hold + WASD, kombinasi dikirim 10Hz oleh ticker */}
        <div className="border-t border-border-base pt-4 space-y-3">
          <p className="text-xs font-semibold txt-main">TELEOP</p>
          <div className="flex items-center gap-2 flex-wrap">
            {holdBtn('forward', ArrowUp, { linear: 1, angular: 0 })}
            {holdBtn('left', ArrowLeft, { linear: 0, angular: 1 })}
            {holdBtn('right', ArrowRight, { linear: 0, angular: -1 })}
            {holdBtn('reverse', ArrowDown, { linear: -1, angular: 0 })}
          </div>
          <p className="text-[11px] txt-sec">{t.wasdHint}</p>
        </div>

        {/* Kontrol mapping TIFA: MAPPING_START/STOP/SAVE/FLAG + MAP_SELECTED */}
        <div className="border-t border-border-base pt-4 space-y-3">
          <p className="text-xs font-semibold txt-main">{t.mapping}</p>
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" className="btn-primary text-xs" disabled={!targetId || sending} onClick={() => postCommand('MAPPING_START', {})}>{t.mapStart}</button>
            <button type="button" className="btn-secondary text-xs" disabled={!targetId || sending} onClick={() => postCommand('MAPPING_STOP', {})}>{t.mapStop}</button>
            <button type="button" className="btn-secondary text-xs" disabled={!targetId || sending} onClick={() => postCommand('MAPPING_SAVE', {})}>{t.mapSave}</button>
            <button type="button" className="btn-secondary text-xs" disabled={!targetId || sending} onClick={() => postCommand('MAPPING_FLAG', {})}>{t.mapFlag}</button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="number"
              aria-label={t.mapId}
              value={mapId}
              onChange={(e) => setMapId(e.target.value)}
              placeholder={t.mapId}
              className="input-field w-24 font-mono text-xs"
            />
            <button
              type="button"
              className="btn-secondary text-xs"
              disabled={!targetId || sending || !/^-?\d+$/.test(mapId.trim())}
              onClick={() => postCommand('MAP_SELECTED', { map_id: Number(mapId.trim()) })}
            >
              MAP_SELECTED
            </button>
          </div>
        </div>
      </section>

      <section className="glass-panel divide-y divide-border-base">
        {roster.length === 0 ? (
          <div className="px-4 py-3 text-sm txt-sec">{t.none}</div>
        ) : roster.map((r) => (
          <div key={r.robot_id} className="px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-mono text-sm txt-main shrink-0">{r.robot_id}</span>
              <span className="text-xs txt-sec shrink-0">{r.lastCode}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="font-mono text-xs txt-sec">{r.battery != null ? `${r.battery}%` : '—'}</span>
              <span className={`status-pill ${statusClass(r.status)}`}>{r.status}</span>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
