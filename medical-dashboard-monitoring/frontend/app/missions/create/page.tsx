'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useApp } from '../../components/AppShell';
import { useLanguage } from '../../components/LanguageProvider';
import MapViewer, { MapMetadata, WaypointItem } from '../../maps/MapViewer';
import {
  Navigation, MapPin, CheckCircle2, Play, XCircle, Search, Package, ShieldAlert, X,
} from 'lucide-react';

const COMPARTMENTS = Array.from({ length: 6 }, (_, n) => n);

/**
 * Peta dummy + waypoint dummy saat backend tidak punya peta ROS aktif.
 * MapViewer menangani id DUMMY- khusus (tanpa preview, badge "Peta Dummy").
 */
// Proxy dashboard mengembalikan array langsung; API SIMRS asli membungkus
// dengan {generatedAt, count, deliveries}. Terima keduanya.
// ponytail: rapikan saat shape proxy dikunci di kontrak.
const asDeliveryList = (res: unknown): any[] =>
  Array.isArray(res) ? res : (res as any)?.deliveries ?? [];

// Sudah tiba / serah-terima / batal tidak perlu dijadwalkan lagi — hilangkan
// dari Resep aktif agar yang tampil hanya yang butuh pengantaran.
const QUEUE_DONE_STATUSES = new Set([
  'MOCK_ARRIVED_AT_ROOM',
  'MOCK_HANDOVER_CONFIRMED',
  'CANCELLED',
]);

interface QueueItem {
  requestCode: string;
  patientMrn: string | null;
  patientName: string;
  roomCode: string | null;
  roomName: string | null;
  status: string;
  statusLabel: string;
}

const queueStatusTone = (s: string) =>
  s === 'MOCK_ARRIVED_AT_ROOM'
    ? 'bg-success/10 text-success border-success/30'
    : s === 'MOCK_IN_TRANSIT'
      ? 'bg-accent/10 text-accent border-accent/30'
      : 'bg-warning/10 text-warning border-warning/30';

function CreateContent() {
  const searchParams = useSearchParams();
  const initialRoom = searchParams.get('room') || '';
  const initialReq = searchParams.get('req') || '';

  const { telemetry, request, wsConnected } = useApp();
  const { dict } = useLanguage();
  const t = dict.create;
  const controlUnavailable = !wsConnected || telemetry.status === 'ERROR';

  const [activeMap, setActiveMap] = useState<MapMetadata | null>(null);
  const [rosWaypoints, setRosWaypoints] = useState<WaypointItem[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);

  const [selectedRoomCode, setSelectedRoomCode] = useState<string>(initialRoom);
  const [selectedWaypoint, setSelectedWaypoint] = useState<WaypointItem | null>(null);
  const [requestCode, setRequestCode] = useState<string>(initialReq);
  const [compartmentNo, setCompartmentNo] = useState<number | null>(null);
  const [patientSearch, setPatientSearch] = useState<string>('');
  // Pilihan massal: requestCode -> kompartemen (null = belum dipilih).
  const [manifest, setManifest] = useState<Record<string, number | null>>({});

  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const notify = (type: 'success' | 'error' | 'info', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage((prev) => (prev?.text === text ? null : prev)), 6000);
  };

  useEffect(() => {
    request('mappings')
      .then(async (mappings: any[]) => {
        const ros = mappings.find((m) => m.kind === 'ROS' && m.active) || mappings.find((m) => m.kind === 'ROS');
        if (ros) {
          const meta = await request(`maps/${ros.id}/metadata`);
          setActiveMap(meta);
          const wps = await request(`maps/${ros.id}/waypoints`);
          setRosWaypoints(wps);
        }
      })
      .catch((err) => notify('error', err instanceof Error ? err.message : String(err)));
  }, [request]);

  // Antrian pengantaran dari SIMRS (pasien + ruangan untuk peta dummy).
  useEffect(() => {
    const refreshQueue = () =>
      request('integrations/simrs/deliveries')
        .then((res) => setDeliveries(asDeliveryList(res)))
        .catch((err) => console.warn('[create] fetch antrian gagal:', err));
    refreshQueue();
    const timer = window.setInterval(refreshQueue, 30000);
    return () => window.clearInterval(timer);
  }, [request]);

  const map: MapMetadata | null = activeMap;

  const patientQueue: QueueItem[] = useMemo(
    () =>
      deliveries.map((d) => ({
        requestCode: String(d.requestCode ?? ''),
        patientMrn: d.patientMrn ?? d.patient?.mrn ?? null,
        patientName: d.patientName ?? d.patient?.fullName ?? '—',
        roomCode: d.roomCode ?? d.patient?.roomCode ?? null,
        roomName: d.roomName ?? d.patient?.roomName ?? null,
        status: String(d.status ?? ''),
        statusLabel: d.statusLabel ?? d.status ?? '',
      }))
      .filter((q) => q.requestCode)
      .filter((q) => !QUEUE_DONE_STATUSES.has(q.status)),
    [deliveries]
  );

  const displayedWaypoints: WaypointItem[] = activeMap ? rosWaypoints : [];

  const filteredQueue = useMemo(() => {
    const q = patientSearch.trim().toLowerCase();
    if (!q) return patientQueue;
    return patientQueue.filter(
      (p) =>
        p.patientName.toLowerCase().includes(q) ||
        (p.patientMrn ?? '').toLowerCase().includes(q) ||
        p.requestCode.toLowerCase().includes(q)
    );
  }, [patientQueue, patientSearch]);

  const waypointDistance = useMemo(() => {
    if (!selectedWaypoint) return null;
    const dx = selectedWaypoint.x - telemetry.pose.x;
    const dy = selectedWaypoint.y - telemetry.pose.y;
    return Math.sqrt(dx * dx + dy * dy);
  }, [selectedWaypoint, telemetry.pose]);

  // Auto-map: ruangan terpilih -> waypoint ROS maupun dummy (null bila tak cocok).
  useEffect(() => {
    if (!selectedRoomCode) return;
    setSelectedWaypoint(displayedWaypoints.find((w) => w.room_code === selectedRoomCode) ?? null);
  }, [selectedRoomCode, displayedWaypoints]);

  const handleSelectPatient = (q: QueueItem) => {
    setSelectedRoomCode(q.roomCode ?? '');
    setRequestCode(q.requestCode);
    setCompartmentNo(null);
  };

  // --- Manifest multi-misi ---
  const rowWaypointFor = (q: QueueItem): WaypointItem | null =>
    displayedWaypoints.find((w) => !!w.room_code && w.room_code === q.roomCode) ?? null;

  const selectedQueue = useMemo(
    () => patientQueue.filter((q) => q.requestCode in manifest),
    [patientQueue, manifest]
  );
  const manifestActive = selectedQueue.length > 0;

  const freeCompartment = (taken: Record<string, number | null>): number | null => {
    const used = new Set(Object.values(taken));
    for (const n of COMPARTMENTS) if (!used.has(n)) return n;
    return null;
  };

  const toggleManifest = (q: QueueItem) =>
    setManifest((prev) => {
      const next = { ...prev };
      if (q.requestCode in next) delete next[q.requestCode];
      else {
        const free = freeCompartment(prev);
        if (free === null) {
          notify('error', t.maxTrays.replace('{n}', String(Object.keys(prev).length)));
          return prev;
        }
        next[q.requestCode] = free;
      }
      return next;
    });

  const setRowCompartment = (code: string, n: number | null) =>
    setManifest((prev) => ({ ...prev, [code]: n }));

  const selectAllVisible = () =>
    setManifest((prev) => {
      const next = { ...prev };
      let full = false;
      for (const q of filteredQueue) {
        if (q.requestCode in next) continue;
        const free = freeCompartment(next);
        if (free === null) { full = true; break; }
        next[q.requestCode] = free;
      }
      if (full) notify('error', t.maxTrays.replace('{n}', String(Object.keys(next).length)));
      return next;
    });

  const clearSelection = () => setManifest({});

  // Validasi manifest sebelum kirim (kompartemen dulu, lalu duplikat, lalu waypoint).
  const manifestError = useMemo(() => {
    if (!selectedQueue.length) return null;
    const comps = selectedQueue.map((q) => manifest[q.requestCode]);
    if (comps.some((c) => c === null || c === undefined)) return t.needTray;
    const dup = comps.find((c, i) => comps.indexOf(c) !== i);
    if (dup !== undefined && dup !== null) return t.dupCompartment.replace('{n}', String(dup));
    const unmapped = Array.from(
      new Set(selectedQueue.filter((q) => !rowWaypointFor(q)).map((q) => q.roomCode ?? '—'))
    );
    if (unmapped.length) return t.unmappedRooms.replace('{rooms}', unmapped.join(', '));
    return null;
  }, [selectedQueue, manifest, displayedWaypoints, t]);

  const handlePickCoordinate = (x: number, y: number) => {
    void navigator.clipboard?.writeText(`x=${x.toFixed(3)}, y=${y.toFixed(3)}`).catch(() => {});
  };

  const handleDispatch = async () => {
    if (!activeMap || !selectedWaypoint) {
      notify('error', activeMap ? t.selectTargetFirst : t.mapUnavailable);
      return;
    }
    if (controlUnavailable) {
      notify('error', t.needConnection);
      return;
    }
    if (compartmentNo === null) {
      notify('error', t.needTray);
      return;
    }
    setSubmitting(true);
    try {
      const res = await request('missions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          waypointId: selectedWaypoint.id,
          roomCode: selectedWaypoint.room_code || selectedRoomCode || null,
          requestCode: requestCode.trim() || null,
          compartmentNo,
        }),
      });
      notify('success', `${t.success} — ${res.missionId.slice(0, 8)}…`);
      setConfirmModalOpen(false);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDispatchBatch = async () => {
    if (controlUnavailable) {
      notify('error', t.needConnection);
      return;
    }
    if (manifestError) {
      notify('error', manifestError);
      return;
    }
    const items = selectedQueue;
    if (!items.length) return;
    setSubmitting(true);
    let done = 0;
    let queued = 0;
    try {
      for (const q of items) {
        const wp = rowWaypointFor(q);
        if (!wp) throw new Error(t.unmappedRooms.replace('{rooms}', q.roomCode ?? '—'));
        const res = await request('missions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            waypointId: wp.id,
            roomCode: wp.room_code || q.roomCode || null,
            requestCode: q.requestCode,
            compartmentNo: manifest[q.requestCode],
          }),
        });
        if (res?.status === 'QUEUED') queued += 1;
        done += 1;
        setMessage({
          type: 'info',
          text: t.batchSubmitting.replace('{done}', String(done)).replace('{total}', String(items.length)),
        });
      }
      setConfirmModalOpen(false);
      clearSelection();
      notify(
        'success',
        t.batchSuccess.replace('{ok}', String(done)) +
          (queued ? ` ${t.batchQueued.replace('{n}', String(queued))}` : '')
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setConfirmModalOpen(false);
      if (done === 0) notify('error', msg);
      else
        notify(
          'error',
          t.batchPartial.replace('{ok}', String(done)).replace('{total}', String(items.length)).replace('{err}', msg)
        );
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDispatch = async () => {
    if (manifestActive) await handleDispatchBatch();
    else await handleDispatch();
  };

  const handleCancel = async () => {
    if (!telemetry.activeMissionId) return;
    if (!window.confirm(dict.missions.cancelConfirm)) return;
    try {
      await request(`missions/${telemetry.activeMissionId}/cancel`, { method: 'POST' });
      notify(
        'info',
        dict.missions.cancelSuccess
      );
    } catch (err) {
      notify('error', err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold txt-main">{t.title}</h1>
        <p className="text-xs txt-sec mt-0.5">{t.subtitle}</p>
      </div>

      {/* Toast message */}
      {message && (
        <div
          className={`flex items-center gap-2 text-sm px-4 py-3 rounded-xl border backdrop-blur-md ${
            message.type === 'success'
              ? 'bg-success/10 text-success border-success/30'
              : message.type === 'error'
                ? 'bg-error/10 text-error border-error/30'
                : 'bg-warning/10 text-warning border-warning/30'
          }`}
        >
          <span className="flex-1">{message.text}</span>
          <button onClick={() => setMessage(null)} className="opacity-60 hover:opacity-100" aria-label="close">
            <X size={14} />
          </button>
        </div>
      )}

      <div className="flex flex-col xl:flex-row gap-4 items-start">
        {/* Main: map + waypoint list */}
        <div className="flex-1 w-full space-y-4 min-w-0">
          {map ? (
            <div className="glass-panel overflow-hidden relative h-[560px]">
              <MapViewer
                meta={map}
                waypoints={displayedWaypoints}
                selectedWaypointId={selectedWaypoint?.id ?? null}
                onSelectWaypoint={(wp) => setSelectedWaypoint(wp)}
                onPickCoordinate={handlePickCoordinate}
                robotPose={telemetry.pose}
              />
            </div>
          ) : (
            <div className="glass-panel p-10 flex items-center justify-center text-xs txt-sec italic">
              {t.mapUnavailable}
            </div>
          )}

          {displayedWaypoints.length > 0 && (
            <div className="glass-panel p-4 space-y-2">
              <p className="text-[11px] txt-sec">{t.waypointsTip}</p>
              <div className="flex flex-wrap gap-2">
                {displayedWaypoints.map((wp) => (
                  <button
                    key={wp.id}
                    type="button"
                    onClick={() => setSelectedWaypoint(wp)}
                    className={`text-[11px] px-2.5 py-1.5 rounded-lg border font-mono transition ${
                      selectedWaypoint?.id === wp.id
                        ? 'bg-accent/15 text-accent border-accent/40'
                        : 'bg-elevated txt-sec border-base hover:border-accent/40'
                    }`}
                  >
                    {wp.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar: patient queue + tray + actions */}
        <aside className="w-full xl:w-96 shrink-0 space-y-4">
          {/* Patient queue */}
          <div className="glass-panel p-5 space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-base">
              <h3 className="font-bold text-xs txt-main flex items-center gap-2">
                <MapPin size={16} className="text-warning" />
                {t.patientList}
              </h3>
              <span className="text-[11px] txt-sec">
                {filteredQueue.length} {t.roomCount}
              </span>
            </div>

            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 txt-sec" />
              <input
                className="input-field w-full pl-9 text-xs"
                value={patientSearch}
                onChange={(e) => setPatientSearch(e.target.value)}
                placeholder={t.searchPatient}
              />
            </div>

            {patientQueue.length > 0 && (
              <div className="flex items-center gap-2 text-[11px]">
                <button type="button" onClick={selectAllVisible} className="btn-ghost px-2 py-1">
                  {t.selectAll}
                </button>
                <button
                  type="button"
                  onClick={clearSelection}
                  disabled={!manifestActive}
                  className="btn-ghost px-2 py-1 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {t.clearSelection}
                </button>
                <span className={`ml-auto ${manifestActive ? 'text-accent' : 'txt-sec'}`}>
                  {t.selectedCount.replace('{n}', String(selectedQueue.length))}
                </span>
              </div>
            )}

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {filteredQueue.length === 0 ? (
                <div className="p-6 text-center txt-sec text-xs italic bg-elevated rounded-xl border border-base">
                  {t.selectPatient}
                </div>
              ) : (
                filteredQueue.map((q) => {
                  const active = q.requestCode === requestCode;
                  const checked = q.requestCode in manifest;
                  const wp = rowWaypointFor(q);
                  return (
                    <div
                      key={q.requestCode}
                      className={`p-3 rounded-xl border text-xs transition ${
                        checked
                          ? 'bg-accent/10 border-accent/40'
                          : active
                            ? 'bg-accent/5 border-accent/30'
                            : 'bg-elevated border-base hover:border-accent/30'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          className="mt-0.5 shrink-0"
                          checked={checked}
                          onChange={() => toggleManifest(q)}
                          aria-label={q.patientName}
                        />
                        <button
                          type="button"
                          onClick={() => handleSelectPatient(q)}
                          className="flex-1 text-left min-w-0"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold txt-main truncate">{q.patientName}</span>
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap ${queueStatusTone(q.status)}`}
                            >
                              {q.statusLabel}
                            </span>
                          </div>
                          <div className="txt-sec mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                            <span>MRN: {q.patientMrn ?? '—'}</span>
                            <span>{q.roomName ?? q.roomCode ?? '—'}</span>
                            <span className="font-mono">{q.requestCode}</span>
                          </div>
                        </button>
                      </div>
                      {checked && (
                        <div className="flex items-center gap-2 mt-2 pl-6">
                          <span className="text-[10px] txt-sec">{t.compartmentPerRow}</span>
                          <select
                            value={manifest[q.requestCode] ?? ''}
                            onChange={(e) =>
                              setRowCompartment(q.requestCode, e.target.value === '' ? null : Number(e.target.value))
                            }
                            className="input-field py-1 px-2 text-[11px] font-mono"
                          >
                            <option value="">—</option>
                            {COMPARTMENTS.map((n) => (
                              <option key={n} value={n}>
                                {n}
                              </option>
                            ))}
                          </select>
                          {!wp && (
                            <span className="text-[10px] text-error">
                              {t.unmappedRooms.replace('{rooms}', q.roomCode ?? '—')}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Tray picker — hanya untuk mode manual; manifest atur kompartemen per baris */}
          {!manifestActive && (
            <div className="glass-panel p-5 space-y-3">
              <div className="flex items-center gap-2 pb-3 border-b border-base">
                <Package size={16} className="text-accent" />
                <h3 className="font-bold text-xs txt-main">{t.selectTray}</h3>
              </div>
              <p className="text-[11px] txt-sec">{t.trayHint}</p>
              <div className="grid grid-cols-6 gap-2">
                {COMPARTMENTS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setCompartmentNo(n)}
                    className={`py-2 rounded-lg text-xs font-mono font-bold border transition ${
                      compartmentNo === n
                        ? 'bg-accent/15 text-accent border-accent/40'
                        : 'bg-elevated txt-sec border-base hover:border-accent/40'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Request code + target + actions */}
          <div className="glass-panel p-5 space-y-3">
            {!manifestActive && (
              <>
                <div className="space-y-1.5">
                  <label className="block text-[11px] txt-sec">{t.selectRoom}</label>
                  <input
                    className="input-field w-full font-mono text-xs"
                    value={requestCode}
                    onChange={(e) => setRequestCode(e.target.value)}
                    placeholder={t.placeholderReq}
                  />
                  <p className="text-[10px] txt-sec opacity-70">{t.requestCodeHint}</p>
                </div>
              </>
            )}

            {manifestActive && (
              <div className="p-3 rounded-xl bg-elevated border border-base text-xs space-y-1">
                <div className="flex items-center gap-2 font-semibold txt-main">
                  <CheckCircle2 size={14} className="text-success" />
                  {t.manifestTitle}
                </div>
                <div className="txt-sec">{t.selectedCount.replace('{n}', String(selectedQueue.length))}</div>
                <ul className="txt-sec space-y-0.5">
                  {selectedQueue.map((q) => (
                    <li key={q.requestCode} className="flex items-center justify-between gap-2">
                      <span className="truncate">{q.patientName}</span>
                      <span className="font-mono shrink-0">{manifest[q.requestCode] ?? '—'}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-[10px] txt-sec opacity-70">{t.manifestHint}</p>
              </div>
            )}

            {controlUnavailable && (
              <div className="text-[11px] px-3 py-2 rounded-lg bg-error/10 text-error border border-error/30">
                {t.needConnection}
              </div>
            )}

            {manifestError && (
              <div className="text-[11px] px-3 py-2 rounded-lg bg-error/10 text-error border border-error/30">
                {manifestError}
              </div>
            )}

            {manifestActive && telemetry.status !== 'IDLE' && (
              <div className="text-[11px] px-3 py-2 rounded-lg bg-warning/10 text-warning border border-warning/30">
                {t.queueHint}
              </div>
            )}

            {!manifestActive && (selectedWaypoint ? (
              <div className="p-3 rounded-xl bg-elevated border border-base text-xs space-y-1.5">
                <div className="flex items-center gap-2 font-semibold txt-main">
                  <CheckCircle2 size={14} className="text-success" />
                  {t.target}
                </div>
                <div className="txt-sec">
                  {t.selectWaypoint}: <span className="font-mono txt-main">{selectedWaypoint.name}</span>
                  {selectedWaypoint.room_code ? ` (${selectedWaypoint.room_code})` : ''}
                </div>
                {selectedRoomCode && (
                  <div className="txt-sec">
                    {t.selectRoom}: <span className="font-mono txt-main">{requestCode || selectedRoomCode}</span>
                  </div>
                )}
                {compartmentNo !== null && (
                  <div className="txt-sec">
                    {t.selectTray}: <span className="font-mono txt-main">{compartmentNo}</span>
                  </div>
                )}
                {waypointDistance !== null && (
                  <div className="txt-sec">
                    {t.distance}:{' '}
                    <span className="font-mono txt-main">{waypointDistance.toFixed(2)} m</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 text-center txt-sec text-xs italic bg-elevated rounded-xl border border-base">
                {t.selectTargetFirst}
              </div>
            ))}

            <button
              type="button"
              disabled={submitting || (manifestActive && !!manifestError)}
              onClick={() => setConfirmModalOpen(true)}
              className="btn-primary w-full py-3.5 text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Navigation size={16} />{' '}
              {manifestActive ? t.batchSubmit.replace('{n}', String(selectedQueue.length)) : t.submit}
            </button>

            <button
              type="button"
              onClick={handleCancel}
              disabled={!telemetry.activeMissionId}
              className="btn-danger w-full py-3 text-xs font-semibold flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <XCircle size={14} /> {t.cancelActive}
            </button>
          </div>
        </aside>
      </div>

      {/* Confirm modal */}
      {confirmModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-panel p-6 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold txt-main text-sm flex items-center gap-2">
                <Navigation size={16} className="text-accent" /> {t.submit}
              </h3>
              <button
                onClick={() => setConfirmModalOpen(false)}
                className="txt-sec hover:txt-main transition"
                aria-label="close"
              >
                <X size={16} />
              </button>
            </div>

            <div className="text-xs space-y-1.5 txt-sec bg-elevated rounded-xl border border-base p-3">
              {manifestActive ? (
                <>
                  <div className="font-semibold txt-main">{t.manifestTitle}</div>
                  {selectedQueue.map((q) => {
                    const wp = rowWaypointFor(q);
                    return (
                      <div key={q.requestCode} className="flex items-center justify-between gap-2">
                        <span className="truncate">
                          {q.patientName} · <span className="font-mono">{q.roomCode ?? '—'}</span>
                        </span>
                        <span className="font-mono shrink-0">
                          {t.compartmentPerRow} {manifest[q.requestCode] ?? '—'}
                          {!wp && <span className="text-error"> !</span>}
                        </span>
                      </div>
                    );
                  })}
                  {manifestError && <div className="text-error pt-1">{manifestError}</div>}
                </>
              ) : (
                selectedWaypoint && (
                  <>
                    <div>
                      {t.selectWaypoint}: <span className="font-mono txt-main">{selectedWaypoint.name}</span>
                    </div>
                    {requestCode.trim() && (
                      <div>
                        {t.selectRoom}: <span className="font-mono txt-main">{requestCode.trim()}</span>
                      </div>
                    )}
                    {compartmentNo !== null && (
                      <div>
                        {t.selectTray}: <span className="font-mono txt-main">{compartmentNo}</span>
                      </div>
                    )}
                  </>
                )
              )}
            </div>

            <div className="p-3 rounded-xl bg-warning/10 border border-warning/30 text-warning text-xs flex items-start gap-2">
              <ShieldAlert size={14} className="shrink-0 mt-0.5" />
              <span>{t.simWarning}</span>
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmModalOpen(false)} className="btn-ghost px-4 py-2 text-xs">
                {dict.create.cancelActive}
              </button>
              <button
                type="button"
                onClick={handleConfirmDispatch}
                disabled={submitting}
                className="btn-primary px-4 py-2 text-xs font-bold flex items-center gap-2 disabled:opacity-50"
              >
                <Play size={14} />{' '}
                {submitting
                  ? t.submitting
                  : manifestActive
                    ? t.batchSubmit.replace('{n}', String(selectedQueue.length))
                    : t.submit}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MissionCreatePage() {
  return (
    <Suspense>
      <CreateContent />
    </Suspense>
  );
}
