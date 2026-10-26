'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useApp } from '../../components/AppShell';
import { useLanguage } from '../../components/LanguageProvider';
import MapViewer, { MapMetadata, WaypointItem } from '../../maps/MapViewer';
import {
  Navigation, MapPin, CheckCircle2, Play, XCircle, Building, Check, ShieldAlert, X,
} from 'lucide-react';

function CreateContent() {
  const searchParams = useSearchParams();
  const initialRoom = searchParams.get('room') || '';
  const initialReq = searchParams.get('req') || '';

  const { telemetry, request, wsConnected } = useApp();
  const { dict } = useLanguage();
  const t = dict.create;
  const controlUnavailable = !wsConnected || telemetry.status === 'ERROR';

  const [activeMap, setActiveMap] = useState<MapMetadata | null>(null);
  const [waypoints, setWaypoints] = useState<WaypointItem[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);

  const [selectedRoomCode, setSelectedRoomCode] = useState<string>(initialRoom);
  const [selectedWaypoint, setSelectedWaypoint] = useState<WaypointItem | null>(null);
  const [requestCode, setRequestCode] = useState<string>(initialReq);

  const [selectedWard, setSelectedWard] = useState<string>('ALL');
  const [selectedFloor, setSelectedFloor] = useState<string>('ALL');

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
          setWaypoints(wps);
        }
      })
      .catch((err) => notify('error', err instanceof Error ? err.message : String(err)));

    request('rooms').then(setRooms).catch(() => {});
  }, [request]);

  useEffect(() => {
    const refreshRooms = () => request('rooms').then(setRooms).catch(() => {});
    const timer = window.setInterval(refreshRooms, 30000);
    return () => window.clearInterval(timer);
  }, [request]);

  useEffect(() => {
    if (selectedRoomCode && waypoints.length > 0) {
      const match = waypoints.find((w) => w.room_code === selectedRoomCode);
      if (match) setSelectedWaypoint(match);
    }
  }, [selectedRoomCode, waypoints]);

  const filteredRooms = useMemo(() => {
    return rooms.filter((r) => {
      if (r.availableInSimrs === false) return false;
      if (selectedWard !== 'ALL' && r.wardCode !== selectedWard) return false;
      if (selectedFloor !== 'ALL' && r.floor.toString() !== selectedFloor) return false;
      return true;
    });
  }, [rooms, selectedWard, selectedFloor]);

  const wards = useMemo(() => {
    const map = new Map<string, string>();
    rooms.forEach((r) => map.set(r.wardCode, r.wardName));
    return Array.from(map.entries());
  }, [rooms]);

  const floors = useMemo(() => {
    const set = new Set<number>();
    rooms.forEach((r) => set.add(r.floor));
    return Array.from(set).sort();
  }, [rooms]);

  const distanceToTarget = useMemo(() => {
    if (!selectedWaypoint) return 0;
    const dx = selectedWaypoint.x - telemetry.pose.x;
    const dy = selectedWaypoint.y - telemetry.pose.y;
    return Math.hypot(dx, dy);
  }, [selectedWaypoint, telemetry.pose]);

  const handleDispatch = async () => {
    if (!selectedWaypoint || controlUnavailable) {
      notify('error', t.needConnection);
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

  const handleCancel = async () => {
    if (!telemetry.activeMissionId) return;
    if (!window.confirm(dict.missions.cancelConfirm)) return;
    try {
      await request(`missions/${telemetry.activeMissionId}/cancel`, { method: 'POST' });
      notify('info', dict.missions.cancelSuccess);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="glass-panel p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold txt-main flex items-center gap-2">
            <Navigation className="text-accent" size={22} />
            {t.title}
            {telemetry.simulated && (
              <span className="status-pill status-warning font-mono">{dict.common.simulated}</span>
            )}
          </h2>
          <p className="text-xs txt-sec mt-1">{t.subtitle}</p>
        </div>

        {telemetry.status === 'NAVIGATING' ? (
          <button onClick={handleCancel} className="btn-danger text-xs flex items-center gap-2">
            <XCircle size={15} /> {t.cancelActive}
          </button>
        ) : (
          <span className="status-pill status-success flex items-center gap-1.5">
            <CheckCircle2 size={14} /> {t.robotReady}
          </span>
        )}
      </div>

      {message && (
        <div
          className={`glass-panel px-4 py-3 text-xs flex items-center justify-between ${
            message.type === 'success' ? 'border-success' : message.type === 'error' ? 'border-error' : 'border-info'
          }`}
        >
          <span className="txt-main">{message.text}</span>
          <button onClick={() => setMessage(null)} className="txt-sec font-bold ml-4" aria-label={dict.common.close}>
            <X size={13} />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Interactive Map */}
        <div className="lg:col-span-7 space-y-4">
          {activeMap ? (
            <MapViewer
              meta={activeMap}
              waypoints={waypoints}
              selectedWaypointId={selectedWaypoint ? selectedWaypoint.id : null}
              onSelectWaypoint={(wp) => {
                setSelectedWaypoint(wp);
                if (wp && wp.room_code) setSelectedRoomCode(wp.room_code);
              }}
              onPickCoordinate={(x, y) => {
                notify('info', `(${x.toFixed(2)}, ${y.toFixed(2)}) — ${t.waypointsTip}`);
              }}
            />
          ) : (
            <div className="glass-panel p-12 text-center txt-sec">
              <p className="font-semibold txt-main">{t.mapUnavailable}</p>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-5 space-y-5">
          {/* Dispatch Target */}
          <div className="glass-panel p-5 space-y-4">
            <h3 className="font-bold text-sm txt-main flex items-center gap-2 pb-3 border-b border-base">
              <MapPin size={17} className="text-accent" />
              {t.target}
            </h3>

            {selectedWaypoint ? (
              <div className="space-y-3 text-xs">
                <div className="p-3.5 bg-accent-muted border border-highlight rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm txt-main">{selectedWaypoint.name}</span>
                    {selectedWaypoint.room_code && (
                      <span className="text-[10px] font-mono txt-accent bg-elevated px-2 py-0.5 rounded">
                        {selectedWaypoint.room_code}
                      </span>
                    )}
                  </div>
                  <p className="txt-sec font-mono text-[11px]">
                    {t.coordinates}: ({selectedWaypoint.x.toFixed(2)}m, {selectedWaypoint.y.toFixed(2)}m) · yaw:{' '}
                    {selectedWaypoint.yaw.toFixed(2)} rad
                  </p>
                  <p className="txt-accent text-[11px]">
                    {t.distance}: <strong>{distanceToTarget.toFixed(2)} m</strong>
                  </p>
                </div>

                <div>
                  <label className="text-[11px] txt-sec font-medium block mb-1">{t.selectRoom}</label>
                  <input
                    type="text"
                    value={requestCode}
                    onChange={(e) => setRequestCode(e.target.value)}
                    placeholder={t.placeholderReq}
                    className="input-field font-mono text-xs"
                  />
                  <p className="text-[10px] txt-sec mt-1">{t.requestCodeHint}</p>
                </div>

                <button
                  id="btn-open-confirm-dispatch"
                  disabled={telemetry.status === 'NAVIGATING' || controlUnavailable}
                  onClick={() => setConfirmModalOpen(true)}
                  className="btn-primary w-full text-xs py-3 flex items-center justify-center gap-2"
                >
                  <Play size={14} /> {t.submit}
                </button>
              </div>
            ) : (
              <div className="p-6 text-center txt-sec text-xs italic bg-elevated rounded-xl border border-base">
                {t.selectTargetFirst}
              </div>
            )}
          </div>

          {/* Room Directory */}
          <div className="glass-panel p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-base">
              <h3 className="font-bold text-xs txt-main flex items-center gap-2">
                <Building size={16} className="text-warning" />
                {t.roomDirectory}
              </h3>
              <span className="text-[11px] txt-sec">
                {filteredRooms.length} {t.roomCount}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <select
                value={selectedWard}
                onChange={(e) => setSelectedWard(e.target.value)}
                className="input-field text-xs"
              >
                <option value="ALL">{t.wardAll}</option>
                {wards.map(([code, name]) => (
                  <option key={code} value={code}>{name}</option>
                ))}
              </select>

              <select
                value={selectedFloor}
                onChange={(e) => setSelectedFloor(e.target.value)}
                className="input-field text-xs"
              >
                <option value="ALL">{t.floorAll}</option>
                {floors.map((fl) => (
                  <option key={fl} value={fl.toString()}>{t.floor} {fl}</option>
                ))}
              </select>
            </div>

            <div className="max-h-[260px] overflow-y-auto space-y-1.5 pr-1 text-xs">
              {filteredRooms.length === 0 ? (
                <p className="text-center txt-sec italic py-4">{dict.common.none}</p>
              ) : (
                filteredRooms.map((room) => {
                  const matchedWp = waypoints.find((w) => w.room_code === room.roomCode);
                  const isSelected = selectedRoomCode === room.roomCode;

                  return (
                    <div
                      key={room.roomCode}
                      onClick={() => {
                        setSelectedRoomCode(room.roomCode);
                        if (matchedWp) setSelectedWaypoint(matchedWp);
                      }}
                      className={`p-2.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                        isSelected
                          ? 'glass-panel-active border-highlight'
                          : 'bg-elevated hover:bg-input border-base'
                      }`}
                    >
                      <div>
                        <p className="font-semibold txt-main">{room.name}</p>
                        <p className="text-[10px] txt-sec font-mono">
                          {room.roomCode} · {room.wardName} ({t.floor} {room.floor})
                        </p>
                      </div>

                      {matchedWp ? (
                        <span className="status-pill status-success flex items-center gap-1 shrink-0">
                          <Check size={11} /> {t.mapped}
                        </span>
                      ) : (
                        <span className="status-pill status-warning shrink-0">{t.unmapped}</span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {confirmModalOpen && selectedWaypoint && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setConfirmModalOpen(false)}
        >
          <div
            className="glass-panel max-w-md w-full p-6 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent-muted text-accent flex items-center justify-center">
                <Navigation size={20} />
              </div>
              <div>
                <h3 className="font-bold text-base txt-main">{t.confirmTitle}</h3>
                <p className="text-xs txt-sec">{t.confirmSubtitle}</p>
              </div>
            </div>

            <div className="bg-elevated p-4 rounded-xl space-y-2 text-xs border border-base">
              <div className="flex justify-between">
                <span className="txt-sec">{t.robot}:</span>
                <strong className="txt-main">NEVO-01</strong>
              </div>
              <div className="flex justify-between">
                <span className="txt-sec">{t.destination}:</span>
                <strong className="txt-accent">{selectedWaypoint.name}</strong>
              </div>
              <div className="flex justify-between font-mono text-[11px]">
                <span className="txt-sec">{t.coordinates}:</span>
                <span className="txt-main">({selectedWaypoint.x.toFixed(2)}m, {selectedWaypoint.y.toFixed(2)}m)</span>
              </div>
              <div className="flex justify-between">
                <span className="txt-sec">{t.estDistance}:</span>
                <span className="txt-main">{distanceToTarget.toFixed(2)} m</span>
              </div>
              {requestCode && (
                <div className="flex justify-between border-t border-base pt-2 font-mono">
                  <span className="txt-sec">{t.simrsRequest}:</span>
                  <span className="txt-warning">{requestCode}</span>
                </div>
              )}
            </div>

            {telemetry.simulated && (
              <div className="bg-warning/10 border border-warning/30 p-3 rounded-xl text-[11px] text-warning flex items-start gap-2">
                <ShieldAlert size={16} className="shrink-0 mt-0.5" />
                <span>{t.simWarning}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setConfirmModalOpen(false)}
                className="btn-ghost text-xs px-4 py-2"
              >
                {dict.common.cancel}
              </button>
              <button
                id="btn-confirm-dispatch-submit"
                disabled={submitting || controlUnavailable}
                onClick={handleDispatch}
                className="btn-primary text-xs flex items-center gap-2"
              >
                {submitting ? t.submitting : `${dict.common.confirm} — ${t.submit}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CreateMissionPage() {
  const { dict } = useLanguage();
  return (
    <Suspense fallback={<div className="p-8 text-center txt-sec text-sm">{dict.common.loading}</div>}>
      <CreateContent />
    </Suspense>
  );
}
