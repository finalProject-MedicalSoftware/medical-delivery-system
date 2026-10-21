'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useApp } from '../components/AppShell';
import MapViewer, { MapMetadata, WaypointItem } from '../mapping/MapViewer';
import {
  Navigation,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  Play,
  XCircle,
  Building,
  Filter,
  Check,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';

function ControlContent() {
  const searchParams = useSearchParams();
  const initialRoom = searchParams.get('room') || '';
  const initialReq = searchParams.get('req') || '';

  const { telemetry, authHeader, request, wsConnected } = useApp();
  const controlUnavailable = !wsConnected || telemetry.status === 'ERROR';

  const [activeMap, setActiveMap] = useState<MapMetadata | null>(null);
  const [waypoints, setWaypoints] = useState<WaypointItem[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);

  // Selection states
  const [selectedRoomCode, setSelectedRoomCode] = useState<string>(initialRoom);
  const [selectedWaypoint, setSelectedWaypoint] = useState<WaypointItem | null>(null);
  const [requestCode, setRequestCode] = useState<string>(initialReq);

  // Filters
  const [selectedWard, setSelectedWard] = useState<string>('ALL');
  const [selectedFloor, setSelectedFloor] = useState<string>('ALL');

  // Confirmation modal & action states
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const notify = (type: 'success' | 'error' | 'info', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage((prev) => (prev?.text === text ? null : prev)), 6000);
  };

  // Load active map, waypoints, and rooms
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
      .catch((err) => notify('error', 'Gagal memuat peta: ' + err.message));

    request('rooms')
      .then(setRooms)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const refreshRooms = () => request('rooms').then(setRooms).catch(() => {});
    const timer = window.setInterval(refreshRooms, 30000);
    return () => window.clearInterval(timer);
  }, [request]);

  // When room or waypoints change, sync selection
  useEffect(() => {
    if (selectedRoomCode && waypoints.length > 0) {
      const match = waypoints.find((w) => w.room_code === selectedRoomCode);
      if (match) setSelectedWaypoint(match);
    }
  }, [selectedRoomCode, waypoints]);

  // Filtered rooms
  const filteredRooms = useMemo(() => {
    return rooms.filter((r) => {
      if (r.availableInSimrs === false) return false;
      if (selectedWard !== 'ALL' && r.wardCode !== selectedWard) return false;
      if (selectedFloor !== 'ALL' && r.floor.toString() !== selectedFloor) return false;
      return true;
    });
  }, [rooms, selectedWard, selectedFloor]);

  // Unique wards and floors
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

  // Calculate distance from robot to target
  const distanceToTarget = useMemo(() => {
    if (!selectedWaypoint) return 0;
    const dx = selectedWaypoint.x - telemetry.pose.x;
    const dy = selectedWaypoint.y - telemetry.pose.y;
    return Math.hypot(dx, dy);
  }, [selectedWaypoint, telemetry.pose]);

  // Handle mission dispatch
  const handleDispatch = async () => {
    if (!selectedWaypoint || controlUnavailable) {
      notify('error', 'Kendali dinonaktifkan: koneksi telemetry robot belum siap.');
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
      notify('success', `Misi navigasi ke "${selectedWaypoint.name}" berhasil dikirim! [ID: ${res.missionId.slice(0, 8)}]`);
      setConfirmModalOpen(false);
    } catch (err: any) {
      notify('error', 'Gagal mengirim misi: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Handle mission cancel
  const handleCancel = async () => {
    if (!telemetry.activeMissionId) return;
    if (!confirm('Batalkan misi navigasi aktif robot NEVO-01?')) return;
    try {
      await request(`missions/${telemetry.activeMissionId}/cancel`, { method: 'POST' });
      notify('info', 'Misi navigasi berhasil dibatalkan oleh operator.');
    } catch (err: any) {
      notify('error', 'Gagal membatalkan misi: ' + err.message);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-950 p-6 rounded-2xl border border-slate-800 shadow-xl">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Navigation className="text-sky-400" size={24} />
            Kendali Navigasi Otonom NEVO
            <span className="text-xs bg-sky-500/15 text-sky-300 border border-sky-500/30 px-2 py-0.5 rounded-full font-mono">
              [SIMULASI]
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Pilih tujuan langsung dari peta occupancy grid atau direktori ruangan SIMRS
          </p>
        </div>

        {/* Action button: Cancel if navigating, or dispatch reminder */}
        {telemetry.status === 'NAVIGATING' ? (
          <button
            onClick={handleCancel}
            className="bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg shadow-rose-600/20 flex items-center gap-2 transition-all"
          >
            <XCircle size={16} /> Batalkan Misi Aktif
          </button>
        ) : (
          <span className="text-xs bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 px-3 py-1.5 rounded-xl font-semibold flex items-center gap-2">
            <CheckCircle2 size={15} /> Robot Siap Menerima Misi
          </span>
        )}
      </div>

      {/* Alert toast */}
      {message && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between ${
            message.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-800 text-emerald-300'
              : message.type === 'error'
              ? 'bg-rose-950/80 border-rose-800 text-rose-300'
              : 'bg-sky-950/80 border-sky-800 text-sky-300'
          }`}
        >
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="text-slate-400 font-bold ml-4">✕</button>
        </div>
      )}

      {/* Main Control Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Interactive Map (7 cols) */}
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
                notify('info', `Titik (${x.toFixed(2)}, ${y.toFixed(2)}) diklik. Pilih waypoint terdaftar untuk pengiriman misi.`);
              }}
              authHeader={authHeader}
            />
          ) : (
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-12 text-center text-slate-400">
              <p className="font-semibold text-white">Belum Ada Peta Navigasi ROS 2 Aktif</p>
              <p className="text-xs mt-1 text-slate-400">Aktifkan versi peta di halaman Peta & Waypoint.</p>
            </div>
          )}
        </div>

        {/* Sidebar: Room Selector & Dispatch Panel (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          {/* Dispatch Target Details Card */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <h3 className="font-bold text-sm text-white flex items-center gap-2 pb-3 border-b border-slate-800">
              <MapPin size={17} className="text-sky-400" />
              Tujuan Navigasi Terpilih
            </h3>

            {selectedWaypoint ? (
              <div className="space-y-3 text-xs">
                <div className="p-3.5 bg-sky-950/40 border border-sky-800/80 rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-white">{selectedWaypoint.name}</span>
                    {selectedWaypoint.room_code && (
                      <span className="text-[10px] font-mono bg-sky-900 text-sky-200 px-2 py-0.5 rounded">
                        {selectedWaypoint.room_code}
                      </span>
                    )}
                  </div>
                  <p className="text-slate-300 font-mono text-[11px]">
                    Koordinat Target: ({selectedWaypoint.x.toFixed(2)}m, {selectedWaypoint.y.toFixed(2)}m) · yaw: {selectedWaypoint.yaw.toFixed(2)} rad
                  </p>
                  <p className="text-sky-300 text-[11px]">
                    Jarak dari robot saat ini: <strong>{distanceToTarget.toFixed(2)} meter</strong>
                  </p>
                </div>

                <div>
                  <label className="text-[11px] text-slate-400 font-medium block mb-1">
                    Kode Permintaan SIMRS (Opsional)
                  </label>
                  <input
                    type="text"
                    value={requestCode}
                    onChange={(e) => setRequestCode(e.target.value)}
                    placeholder="e.g. REQ-DEL-101"
                    className="w-full bg-slate-900 border border-slate-700 text-xs font-mono text-slate-200 rounded-xl p-2.5 focus:outline-none focus:border-sky-500"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Jika diisi, status pengantaran obat SIMRS akan dikaitkan dengan misi ini.
                  </p>
                </div>

                <button
                  id="btn-open-confirm-dispatch"
                  disabled={telemetry.status === 'NAVIGATING' || controlUnavailable}
                  onClick={() => setConfirmModalOpen(true)}
                  className="w-full bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-xs py-3 rounded-xl shadow-lg shadow-sky-600/20 transition-all flex items-center justify-center gap-2"
                >
                  <Play size={15} /> Mulai Misi Navigasi Otonom
                </button>
              </div>
            ) : (
              <div className="p-6 text-center text-slate-500 text-xs italic bg-slate-900/40 rounded-xl border border-slate-800">
                Pilih salah satu ruangan atau pin waypoint pada peta untuk menentukan target.
              </div>
            )}
          </div>

          {/* Room Directory & Filter Accordion */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-xs text-white flex items-center gap-2">
                <Building size={16} className="text-amber-400" />
                Daftar Ruangan SIMRS
              </h3>
              <span className="text-[11px] text-slate-400">{filteredRooms.length} Ruangan</span>
            </div>

            {/* Filter controls */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <select
                value={selectedWard}
                onChange={(e) => setSelectedWard(e.target.value)}
                className="bg-slate-900 border border-slate-700 text-slate-200 rounded-lg p-2 text-xs focus:outline-none"
              >
                <option value="ALL">Semua Bangsal</option>
                {wards.map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>

              <select
                value={selectedFloor}
                onChange={(e) => setSelectedFloor(e.target.value)}
                className="bg-slate-900 border border-slate-700 text-slate-200 rounded-lg p-2 text-xs focus:outline-none"
              >
                <option value="ALL">Semua Lantai</option>
                {floors.map((fl) => (
                  <option key={fl} value={fl.toString()}>
                    Lantai {fl}
                  </option>
                ))}
              </select>
            </div>

            {/* Room items list */}
            <div className="max-h-[260px] overflow-y-auto space-y-1.5 pr-1 text-xs">
              {filteredRooms.map((room) => {
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
                        ? 'bg-sky-950/60 border-sky-600/80 text-white'
                        : 'bg-slate-900/60 hover:bg-slate-900 border-slate-800 text-slate-300'
                    }`}
                  >
                    <div>
                      <p className="font-semibold text-slate-200">{room.name}</p>
                      <p className="text-[10px] text-slate-400 font-mono">
                        {room.roomCode} · {room.wardName} (Lt. {room.floor})
                      </p>
                    </div>

                    {matchedWp ? (
                      <span className="text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-md flex items-center gap-1 font-medium">
                        <Check size={11} /> Terpetakan
                      </span>
                    ) : (
                      <span className="text-[10px] bg-amber-500/15 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-md font-medium">
                        Belum dipetakan
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {confirmModalOpen && selectedWaypoint && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center">
                <Navigation size={20} />
              </div>
              <div>
                <h3 className="font-bold text-base text-white">Konfirmasi Pengiriman Misi</h3>
                <p className="text-xs text-slate-400">Verifikasi target sebelum mengirimkan perintah navigasi</p>
              </div>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl space-y-2 text-xs border border-slate-800">
              <div className="flex justify-between">
                <span className="text-slate-400">Robot:</span>
                <strong className="text-white">NEVO-01 (Otonom)</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Tujuan:</span>
                <strong className="text-sky-300">{selectedWaypoint.name}</strong>
              </div>
              <div className="flex justify-between font-mono text-[11px]">
                <span className="text-slate-400">Koordinat ROS:</span>
                <span className="text-slate-300">({selectedWaypoint.x.toFixed(2)}m, {selectedWaypoint.y.toFixed(2)}m)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Estimasi Jarak:</span>
                <span className="text-slate-300">{distanceToTarget.toFixed(2)} meter</span>
              </div>
              {requestCode && (
                <div className="flex justify-between border-t border-slate-800/80 pt-2 font-mono">
                  <span className="text-slate-400">Request SIMRS:</span>
                  <span className="text-amber-300">{requestCode}</span>
                </div>
              )}
            </div>

            <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-xl text-[11px] text-amber-300 flex items-start gap-2">
              <ShieldAlert size={16} className="shrink-0 text-amber-400 mt-0.5" />
              <span>
                Misi akan dijalankan dalam <strong>Mode Simulasi Web</strong>. Robot simulator akan bergerak menuju koordinat sasaran.
              </span>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setConfirmModalOpen(false)}
                className="px-4 py-2 text-xs text-slate-400 hover:text-slate-200"
              >
                Batal
              </button>
              <button
                id="btn-confirm-dispatch-submit"
                disabled={submitting || controlUnavailable}
                onClick={handleDispatch}
                className="bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white font-semibold text-xs px-5 py-2.5 rounded-xl shadow-lg shadow-sky-600/20 transition-all flex items-center gap-2"
              >
                {submitting ? 'Mengirim Misi...' : 'Konfirmasi & Kirim Misi'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ControlPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-400">Memuat kendali navigasi...</div>}>
      <ControlContent />
    </Suspense>
  );
}
