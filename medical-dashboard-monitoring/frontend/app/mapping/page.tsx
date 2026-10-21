'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  UploadCloud,
  Map as MapIcon,
  Database,
  MapPin,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Plus,
  Trash2,
  Edit2,
  Power,
  Layers,
  Building,
  Check,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import MapViewer, { MapMetadata, WaypointItem } from './MapViewer';
import { useApp } from '../components/AppShell';

type ImportRecord = {
  id: string;
  kind: 'ROS' | 'SIMRS';
  file_name: string;
  summary: any;
  active: boolean;
  created_by: string;
  created_at: string;
};

type RoomItem = {
  roomCode: string;
  name: string;
  wardCode: string;
  wardName: string;
  floor: number;
  source?: string;
  availableInSimrs?: boolean;
  waypointStatus?: string;
};

export default function MappingPage() {
  // Auth state
  const { user, request } = useApp();
  const role = user?.role || 'operator';
  const [tab, setTab] = useState<'VIEWER' | 'ROS_UPLOAD' | 'SIMRS_UPLOAD' | 'AUDIT'>('VIEWER');

  // File upload states
  const [yamlFile, setYamlFile] = useState<File | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);

  // Data states
  const [records, setRecords] = useState<ImportRecord[]>([]);
  const [selectedMapId, setSelectedMapId] = useState<string>('');
  const [selectedMapMeta, setSelectedMapMeta] = useState<MapMetadata | null>(null);
  const [waypoints, setWaypoints] = useState<WaypointItem[]>([]);
  const [rooms, setRooms] = useState<RoomItem[]>([]);

  // Selected waypoint for map highlight
  const [selectedWpId, setSelectedWpId] = useState<string | null>(null);

  // Waypoint form state
  const [editingWpId, setEditingWpId] = useState<string | null>(null);
  const [wpRoomCode, setWpRoomCode] = useState('');
  const [wpName, setWpName] = useState('');
  const [wpX, setWpX] = useState('');
  const [wpY, setWpY] = useState('');
  const [wpYaw, setWpYaw] = useState('0.00');

  // Notification message
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const notify = (type: 'success' | 'error' | 'info', text: string) => {
    setMessage({ type, text });
    setTimeout(() => {
      setMessage((prev) => (prev?.text === text ? null : prev));
    }, 6000);
  };

  // Load records and rooms
  const loadInitialData = useCallback(async () => {
    try {
      await request('integrations/simrs/status');
      const mappings: ImportRecord[] = await request('mappings');
      setRecords(mappings);

      // Also load rooms from active/latest SIMRS
      try {
        const roomList: RoomItem[] = await request('rooms');
        setRooms(roomList);
      } catch {
        // Ignored if no SIMRS uploaded yet
      }

      // Auto-select active ROS map or the first ROS map
      const rosMaps = mappings.filter((m) => m.kind === 'ROS');
      const activeMap = rosMaps.find((m) => m.active) || rosMaps[0];
      if (activeMap) {
        setSelectedMapId(activeMap.id);
      }
    } catch (err: any) {
      notify('error', 'Gagal memuat data: ' + err.message);
    }
  }, [request]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  useEffect(() => {
    const timer = window.setInterval(loadInitialData, 30000);
    return () => window.clearInterval(timer);
  }, [loadInitialData]);

  // When selected map changes, fetch its metadata and waypoints
  useEffect(() => {
    if (!selectedMapId) {
      setSelectedMapMeta(null);
      setWaypoints([]);
      return;
    }

    let active = true;
    Promise.all([
      request(`maps/${selectedMapId}/metadata`),
      request(`maps/${selectedMapId}/waypoints`),
    ])
      .then(([meta, wps]) => {
        if (!active) return;
        setSelectedMapMeta(meta);
        setWaypoints(wps);
      })
      .catch((err) => {
        if (!active) return;
        notify('error', 'Gagal memuat detail peta: ' + err.message);
      });

    return () => {
      active = false;
    };
  }, [selectedMapId, request]);

  // Handle map canvas click coordinates
  const handleCanvasPick = (x: number, y: number) => {
    setWpX(x.toFixed(3));
    setWpY(y.toFixed(3));
    notify('info', `Koordinat (${x.toFixed(3)}, ${y.toFixed(3)}) disalin dari peta`);
  };

  // Upload handler for SIMRS or ROS
  const handleUpload = async () => {
    if (!yamlFile) return;
    setUploadBusy(true);
    try {
      const form = new FormData();
      let endpoint = '';

      if (tab === 'SIMRS_UPLOAD') {
        form.append('file', yamlFile);
        endpoint = 'simrs-mappings/import';
      } else {
        if (!imageFile) throw new Error('Harap pilih file citra peta (.pgm atau .png)');
        form.append('yaml', yamlFile);
        form.append('image', imageFile);
        endpoint = 'maps/import';
      }

      const res = await request(endpoint, { method: 'POST', body: form });
      notify('success', `Upload berhasil disimpan (ID: ${res.id})`);
      setYamlFile(null);
      setImageFile(null);
      await loadInitialData();
      if (tab === 'ROS_UPLOAD') {
        setSelectedMapId(res.id);
        setTab('VIEWER');
      }
    } catch (err: any) {
      notify('error', err.message);
    } finally {
      setUploadBusy(false);
    }
  };

  // Web Map Activation (Admin only)
  const handleActivateMap = async (id: string) => {
    if (role !== 'admin') {
      notify('error', 'Hanya pengguna dengan peran Admin yang dapat mengaktifkan peta web.');
      return;
    }
    if (
      !confirm(
        'Konfirmasi: Aktifkan konfigurasi peta ini untuk visualisasi web?\n\nCATATAN: Tindakan ini TIDAK mengubah peta aktif pada robot fisik.'
      )
    ) {
      return;
    }

    try {
      await request(`maps/${id}/activate`, { method: 'POST' });
      notify('success', 'Konfigurasi peta web berhasil diaktifkan.');
      await loadInitialData();
    } catch (err: any) {
      notify('error', 'Aktivasi gagal: ' + err.message);
    }
  };

  // Waypoint Form: Save (Create or Update)
  const handleSaveWaypoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMapId) {
      notify('error', 'Pilih peta ROS terlebih dahulu.');
      return;
    }
    if (!wpName.trim()) {
      notify('error', 'Nama waypoint wajib diisi.');
      return;
    }
    const xVal = parseFloat(wpX);
    const yVal = parseFloat(wpY);
    const yawVal = parseFloat(wpYaw);
    if (isNaN(xVal) || isNaN(yVal) || isNaN(yawVal)) {
      notify('error', 'Koordinat X, Y, dan Yaw harus berupa angka numerik valid.');
      return;
    }

    try {
      const payload = {
        roomCode: wpRoomCode.trim() || null,
        name: wpName.trim(),
        x: xVal,
        y: yVal,
        yaw: yawVal,
      };

      if (editingWpId) {
        await request(`maps/${selectedMapId}/waypoints/${editingWpId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        notify('success', `Waypoint "${wpName}" berhasil diperbarui.`);
      } else {
        await request(`maps/${selectedMapId}/waypoints`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        notify('success', `Waypoint "${wpName}" berhasil ditambahkan.`);
      }

      // Reset form
      setEditingWpId(null);
      setWpRoomCode('');
      setWpName('');
      setWpX('');
      setWpY('');
      setWpYaw('0.00');

      // Refresh waypoints
      const updatedWps = await request(`maps/${selectedMapId}/waypoints`);
      setWaypoints(updatedWps);
    } catch (err: any) {
      notify('error', err.message);
    }
  };

  // Toggle Waypoint Active state
  const handleToggleWaypoint = async (wpId: string) => {
    try {
      const res = await request(`maps/${selectedMapId}/waypoints/${wpId}/toggle`, {
        method: 'PATCH',
      });
      notify('info', `Status waypoint diubah: ${res.enabled ? 'Aktif' : 'Nonaktif'}`);
      const updatedWps = await request(`maps/${selectedMapId}/waypoints`);
      setWaypoints(updatedWps);
    } catch (err: any) {
      notify('error', err.message);
    }
  };

  // Delete Waypoint
  const handleDeleteWaypoint = async (wpId: string, name: string) => {
    if (!confirm(`Hapus waypoint "${name}" dari peta ini?`)) return;
    try {
      await request(`maps/${selectedMapId}/waypoints/${wpId}`, { method: 'DELETE' });
      notify('success', `Waypoint "${name}" berhasil dihapus.`);
      const updatedWps = await request(`maps/${selectedMapId}/waypoints`);
      setWaypoints(updatedWps);
      if (selectedWpId === wpId) setSelectedWpId(null);
      if (editingWpId === wpId) setEditingWpId(null);
    } catch (err: any) {
      notify('error', err.message);
    }
  };

  // Start editing a waypoint
  const startEditWaypoint = (wp: WaypointItem) => {
    setEditingWpId(wp.id);
    setWpRoomCode(wp.room_code || '');
    setWpName(wp.name);
    setWpX(wp.x.toString());
    setWpY(wp.y.toString());
    setWpYaw(wp.yaw.toString());
    setSelectedWpId(wp.id);
  };

  // Map room to waypoint helper
  const startMappingRoom = (room: RoomItem) => {
    setEditingWpId(null);
    setWpRoomCode(room.roomCode);
    setWpName(room.name);
    notify('info', `Mode pemetaan ruangan "${room.name}". Klik titik pada peta untuk menentukan koordinat.`);
  };

  const rosMaps = records.filter((r) => r.kind === 'ROS');

  return (
    <main className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
      {/* Top Navbar */}
      <header className="border-b border-neutral-200 bg-white sticky top-0 z-30 px-6 py-4 flex flex-wrap justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-600 to-cyan-400 flex items-center justify-center shadow-lg shadow-sky-500/20">
            <Layers className="text-white" size={22} />
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-wide text-white">NEVO · Web Monitoring</h1>
            <p className="text-xs text-slate-400">Pusat Manajemen Peta Navigasi ROS 2 & Waypoint Rumah Sakit</p>
          </div>
        </div>

        {/* Global Status Banner */}
        <div className="bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs px-3 py-1.5 rounded-lg flex items-center gap-2">
          <AlertTriangle size={15} />
          <span>Komunikasi robot fisik belum terhubung · Mode Simulasi Web</span>
        </div>

        {/* Session status */}
        <div className="flex items-center gap-3 bg-slate-900 border border-slate-800 rounded-xl p-1.5 px-3">
          <Lock size={15} className="text-slate-400" />
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-300">{user?.username} · {role === 'admin' ? 'Administrator' : 'Operator'}</span>
          </div>
          <button
            id="btn-refresh-all"
            onClick={loadInitialData}
            title="Muat Ulang Data"
            className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-md transition-colors"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </header>

      {/* Main Tabs Navigation */}
      <nav className="bg-slate-950 px-6 pt-3 border-b border-slate-800 flex gap-2">
        <button
          id="tab-btn-viewer"
          onClick={() => setTab('VIEWER')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-all border-b-2 ${
            tab === 'VIEWER'
              ? 'bg-slate-900 text-sky-400 border-sky-400 shadow-sm'
              : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-900/40'
          }`}
        >
          <MapIcon size={16} /> Viewer Peta & Waypoint
        </button>
        <button
          id="tab-btn-ros-upload"
          onClick={() => setTab('ROS_UPLOAD')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-all border-b-2 ${
            tab === 'ROS_UPLOAD'
              ? 'bg-slate-900 text-sky-400 border-sky-400 shadow-sm'
              : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-900/40'
          }`}
        >
          <UploadCloud size={16} /> Upload Peta ROS 2
        </button>
        <button
          id="tab-btn-simrs-upload"
          onClick={() => setTab('SIMRS_UPLOAD')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-all border-b-2 ${
            tab === 'SIMRS_UPLOAD'
              ? 'bg-slate-900 text-sky-400 border-sky-400 shadow-sm'
              : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-900/40'
          }`}
        >
          <Database size={16} /> Mapping SIMRS (YAML)
        </button>
        <button
          id="tab-btn-audit"
          onClick={() => setTab('AUDIT')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-all border-b-2 ${
            tab === 'AUDIT'
              ? 'bg-slate-900 text-sky-400 border-sky-400 shadow-sm'
              : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-900/40'
          }`}
        >
          <Layers size={16} /> Riwayat & Audit
        </button>
      </nav>

      {/* Alert Notifications */}
      {message && (
        <div
          id="global-alert-toast"
          className={`mx-6 mt-4 p-3.5 rounded-xl border flex items-center justify-between text-xs animate-in fade-in slide-in-from-top-2 duration-200 ${
            message.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-800 text-emerald-300'
              : message.type === 'error'
              ? 'bg-rose-950/80 border-rose-800 text-rose-300'
              : 'bg-sky-950/80 border-sky-800 text-sky-300'
          }`}
        >
          <span className="font-medium">{message.text}</span>
          <button
            onClick={() => setMessage(null)}
            className="text-slate-400 hover:text-slate-200 ml-4 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* TAB CONTENT 1: VIEWER & WAYPOINTS */}
      {tab === 'VIEWER' && (
        <div className="flex-1 p-6 space-y-6">
          {/* Map Selector & Activation Bar */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <label className="text-xs text-slate-400 font-medium">Peta ROS 2:</label>
              <select
                id="select-ros-map"
                value={selectedMapId}
                onChange={(e) => setSelectedMapId(e.target.value)}
                className="bg-slate-900 border border-slate-700 text-sm text-slate-100 rounded-xl px-3 py-2 focus:outline-none focus:border-sky-500 font-mono"
              >
                {rosMaps.length === 0 ? (
                  <option value="">Belum ada peta ROS 2 diunggah</option>
                ) : (
                  rosMaps.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.file_name} · {m.id.slice(0, 8)} {m.active ? '★ (Aktif di Web)' : ''}
                    </option>
                  ))
                )}
              </select>
            </div>

            {selectedMapMeta && (
              <div className="flex items-center gap-3">
                {selectedMapMeta.active ? (
                  <span className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-xs px-3 py-1.5 rounded-xl font-semibold flex items-center gap-1.5">
                    <CheckCircle2 size={15} /> Peta Aktif Web
                  </span>
                ) : (
                  <button
                    id="btn-activate-web-map"
                    disabled={role !== 'admin'}
                    onClick={() => handleActivateMap(selectedMapId)}
                    title={
                      role === 'admin'
                        ? 'Aktifkan konfigurasi peta ini di web'
                        : 'Hanya Admin yang berhak mengaktifkan versi peta web'
                    }
                    className={`text-xs px-4 py-2 rounded-xl font-medium transition-all flex items-center gap-1.5 ${
                      role === 'admin'
                        ? 'bg-sky-600 hover:bg-sky-500 text-white shadow-lg shadow-sky-600/20'
                        : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                    }`}
                  >
                    <Power size={14} /> Aktifkan Peta Web
                  </button>
                )}
                <a
                  id="link-raw-preview"
                  href={`/api/proxy/maps/${selectedMapId}/preview`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs px-3 py-2 rounded-xl flex items-center gap-1.5 transition-colors"
                >
                  <ExternalLink size={14} /> Preview PNG
                </a>
              </div>
            )}
          </div>

          {/* Grid Layout: Interactive Map Canvas + Management Panel */}
          {selectedMapMeta ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Map Viewer Column (7 cols) */}
              <div className="lg:col-span-7 space-y-3">
                <MapViewer
                  meta={selectedMapMeta}
                  waypoints={waypoints}
                  selectedWaypointId={selectedWpId}
                  onSelectWaypoint={(wp) => {
                    setSelectedWpId(wp ? wp.id : null);
                    if (wp) {
                      setEditingWpId(wp.id);
                      setWpRoomCode(wp.room_code || '');
                      setWpName(wp.name);
                      setWpX(wp.x.toString());
                      setWpY(wp.y.toString());
                      setWpYaw(wp.yaw.toString());
                    }
                  }}
                  onPickCoordinate={handleCanvasPick}
                  authHeader=""
                />
              </div>

              {/* Waypoints & Rooms Sidebar (5 cols) */}
              <div className="lg:col-span-5 space-y-5">
                {/* Add/Edit Waypoint Card */}
                <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 shadow-lg">
                  <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
                    <h3 className="font-semibold text-sm flex items-center gap-2 text-white">
                      <MapPin size={16} className="text-sky-400" />
                      {editingWpId ? 'Edit Waypoint' : 'Tambah Waypoint Baru'}
                    </h3>
                    {editingWpId && (
                      <button
                        onClick={() => {
                          setEditingWpId(null);
                          setWpRoomCode('');
                          setWpName('');
                          setWpX('');
                          setWpY('');
                          setWpYaw('0.00');
                        }}
                        className="text-xs text-slate-400 hover:text-slate-200"
                      >
                        Batal Edit
                      </button>
                    )}
                  </div>

                  <form onSubmit={handleSaveWaypoint} className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] text-slate-400 font-medium block mb-1">
                          Kode Ruang (SIMRS)
                        </label>
                        <select
                          id="input-wp-room-code"
                          value={wpRoomCode}
                          onChange={(e) => {
                            setWpRoomCode(e.target.value);
                            const matchedRoom = rooms.find((r) => r.roomCode === e.target.value);
                            if (matchedRoom && !wpName) {
                              setWpName(matchedRoom.name);
                            }
                          }}
                          className="w-full bg-slate-900 border border-slate-700 text-xs text-slate-200 rounded-xl p-2.5 focus:outline-none focus:border-sky-500"
                        >
                          <option value="">(Tanpa relasi ruang)</option>
                          {rooms.map((r) => (
                            <option key={r.roomCode} value={r.roomCode}>
                              {r.roomCode} - {r.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="text-[11px] text-slate-400 font-medium block mb-1">
                          Nama Waypoint <span className="text-rose-400">*</span>
                        </label>
                        <input
                          id="input-wp-name"
                          type="text"
                          required
                          value={wpName}
                          onChange={(e) => setWpName(e.target.value)}
                          placeholder="e.g. Bed 1 Ruang Melati"
                          className="w-full bg-slate-900 border border-slate-700 text-xs text-slate-200 rounded-xl p-2.5 focus:outline-none focus:border-sky-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="text-[11px] text-slate-400 font-medium block mb-1">
                          X (meter) <span className="text-rose-400">*</span>
                        </label>
                        <input
                          id="input-wp-x"
                          type="number"
                          step="0.001"
                          required
                          value={wpX}
                          onChange={(e) => setWpX(e.target.value)}
                          placeholder="-2.50"
                          className="w-full bg-slate-900 border border-slate-700 text-xs font-mono text-slate-200 rounded-xl p-2.5 focus:outline-none focus:border-sky-500"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-400 font-medium block mb-1">
                          Y (meter) <span className="text-rose-400">*</span>
                        </label>
                        <input
                          id="input-wp-y"
                          type="number"
                          step="0.001"
                          required
                          value={wpY}
                          onChange={(e) => setWpY(e.target.value)}
                          placeholder="4.10"
                          className="w-full bg-slate-900 border border-slate-700 text-xs font-mono text-slate-200 rounded-xl p-2.5 focus:outline-none focus:border-sky-500"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-400 font-medium block mb-1">
                          Yaw (rad) <span className="text-rose-400">*</span>
                        </label>
                        <input
                          id="input-wp-yaw"
                          type="number"
                          step="0.01"
                          required
                          value={wpYaw}
                          onChange={(e) => setWpYaw(e.target.value)}
                          placeholder="0.00"
                          className="w-full bg-slate-900 border border-slate-700 text-xs font-mono text-slate-200 rounded-xl p-2.5 focus:outline-none focus:border-sky-500"
                        />
                      </div>
                    </div>

                    {/* Quick orientation buttons */}
                    <div className="flex items-center gap-1.5 pt-1">
                      <span className="text-[10px] text-slate-500">Preset Yaw:</span>
                      {[
                        ['0.00', '0° (Depan)'],
                        ['1.57', '90° (Kiri)'],
                        ['3.14', '180° (Belakang)'],
                        ['-1.57', '-90° (Kanan)'],
                      ].map(([val, label]) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setWpYaw(val)}
                          className="text-[10px] bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 px-2 py-0.5 rounded-md"
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    <button
                      id="btn-submit-waypoint"
                      type="submit"
                      className="w-full mt-2 bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white font-medium text-xs py-2.5 rounded-xl shadow-lg shadow-sky-600/20 transition-all flex items-center justify-center gap-2"
                    >
                      {editingWpId ? <Check size={16} /> : <Plus size={16} />}
                      {editingWpId ? 'Perbarui Waypoint' : 'Simpan Waypoint ke Peta'}
                    </button>
                  </form>
                </div>

                {/* Waypoint List & Room Directory Tabs */}
                <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col h-[320px]">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <span className="font-semibold text-xs text-white">
                      Daftar Waypoint ({waypoints.length}) & Ruangan SIMRS ({rooms.length})
                    </span>
                  </div>

                  <div className="flex-1 overflow-y-auto divide-y divide-slate-800/80 pr-1 mt-2 text-xs">
                    {/* Waypoints section */}
                    <div className="mb-3">
                      <p className="text-[11px] font-bold text-sky-400 uppercase tracking-wider mb-2">
                        Waypoint Terdaftar Pada Peta
                      </p>
                      {waypoints.length === 0 ? (
                        <p className="text-slate-500 italic py-2">Belum ada waypoint pada peta ini.</p>
                      ) : (
                        waypoints.map((wp) => (
                          <div
                            key={wp.id}
                            className={`p-2.5 rounded-xl my-1 transition-all flex items-center justify-between gap-3 ${
                              selectedWpId === wp.id
                                ? 'bg-sky-950/60 border border-sky-800/80 text-white'
                                : 'bg-slate-900/60 hover:bg-slate-900 border border-slate-800 text-slate-300'
                            }`}
                          >
                            <div
                              className="flex-1 cursor-pointer"
                              onClick={() => {
                                setSelectedWpId(wp.id);
                                startEditWaypoint(wp);
                              }}
                            >
                              <div className="font-medium flex items-center gap-1.5">
                                <span className={wp.enabled ? 'text-sky-300' : 'text-slate-500 line-through'}>
                                  {wp.name}
                                </span>
                                {wp.room_code && (
                                  <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">
                                    {wp.room_code}
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] font-mono text-slate-400">
                                ({wp.x.toFixed(2)}m, {wp.y.toFixed(2)}m) · yaw: {wp.yaw.toFixed(2)}
                              </p>
                            </div>

                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleToggleWaypoint(wp.id)}
                                title={wp.enabled ? 'Nonaktifkan' : 'Aktifkan'}
                                className={`p-1.5 rounded-lg border transition-colors ${
                                  wp.enabled
                                    ? 'bg-emerald-950/50 text-emerald-400 border-emerald-800 hover:bg-emerald-900/50'
                                    : 'bg-slate-800 text-slate-500 border-slate-700 hover:bg-slate-700'
                                }`}
                              >
                                <Power size={13} />
                              </button>
                              <button
                                onClick={() => startEditWaypoint(wp)}
                                title="Edit Waypoint"
                                className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
                              >
                                <Edit2 size={13} />
                              </button>
                              <button
                                onClick={() => handleDeleteWaypoint(wp.id, wp.name)}
                                title="Hapus Waypoint"
                                className="p-1.5 rounded-lg border border-rose-900/40 bg-rose-950/30 text-rose-400 hover:bg-rose-900/50 transition-colors"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Rooms Directory sync */}
                    <div className="pt-3">
                      <p className="text-[11px] font-bold text-amber-400 uppercase tracking-wider mb-2">
                        Status Ruangan SIMRS Dummy
                      </p>
                      {rooms.length === 0 ? (
                        <p className="text-slate-500 italic py-2">Belum ada direktori SIMRS live tersinkron.</p>
                      ) : (
                        rooms.map((room) => {
                          const matchedWp = waypoints.find((w) => w.room_code === room.roomCode);
                          return (
                            <div
                              key={room.roomCode}
                              className="p-2 rounded-xl my-1 bg-slate-900/40 border border-slate-800 flex items-center justify-between text-xs"
                            >
                              <div>
                                <span className="font-medium text-slate-200">{room.name}</span>
                                <span className="text-[10px] text-slate-400 ml-2">
                                  [{room.roomCode}] · Lantai {room.floor}
                                </span>
                              </div>
                              {room.availableInSimrs === false ? (
                                <span className="text-[10px] bg-rose-500/10 border border-rose-500/30 text-rose-300 px-2 py-0.5 rounded-md">
                                  Perlu rekonsiliasi
                                </span>
                              ) : matchedWp ? (
                                <button
                                  onClick={() => {
                                    setSelectedWpId(matchedWp.id);
                                    startEditWaypoint(matchedWp);
                                  }}
                                  className="text-[10px] bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-2 py-0.5 rounded-md flex items-center gap-1"
                                >
                                  <Check size={12} /> Terpetakan
                                </button>
                              ) : (
                                <button
                                  onClick={() => startMappingRoom(room)}
                                  className="text-[10px] bg-amber-500/15 border border-amber-500/40 text-amber-300 hover:bg-amber-500/25 px-2 py-0.5 rounded-md flex items-center gap-1 transition-colors"
                                >
                                  <Plus size={12} /> Belum dipetakan
                                </button>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-12 text-center text-slate-400">
              <MapIcon size={48} className="mx-auto text-slate-600 mb-3" />
              <p className="text-base font-semibold text-slate-200">Belum Ada Peta Navigasi ROS 2</p>
              <p className="text-xs max-w-md mx-auto mt-1 mb-4">
                Unggah sepasang file konfigurasi (<code>map.yaml</code>) dan gambar occupancy grid (
                <code>map.pgm</code> atau <code>map.png</code>) pada tab Upload Peta.
              </p>
              <button
                onClick={() => setTab('ROS_UPLOAD')}
                className="bg-sky-600 hover:bg-sky-500 text-white text-xs px-4 py-2.5 rounded-xl font-medium"
              >
                Unggah Peta Sekarang
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT 2: ROS MAP UPLOAD */}
      {tab === 'ROS_UPLOAD' && (
        <div className="flex-1 p-6 max-w-4xl mx-auto w-full space-y-6">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <h2 className="text-base font-bold text-white mb-1 flex items-center gap-2">
              <UploadCloud className="text-sky-400" size={20} />
              Upload Peta Navigasi ROS 2 (map.yaml + .pgm / .png)
            </h2>
            <p className="text-xs text-slate-400 mb-6">
              Sistem akan memvalidasi header gambar, membaca resolusi, origin, dimensi piksel, dan secara otomatis
              mengonversi citra PGM ke pratinjau browser PNG.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="border-2 border-dashed border-slate-800 hover:border-sky-500/60 rounded-2xl p-6 flex flex-col items-center justify-center gap-3 bg-slate-900/40 cursor-pointer transition-colors">
                <UploadCloud className="text-sky-400" size={32} />
                <div className="text-center">
                  <p className="text-xs font-semibold text-slate-200">File Konfigurasi YAML (map.yaml)</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Memuat resolution, origin, & image reference</p>
                </div>
                <input
                  id="file-input-ros-yaml"
                  accept=".yaml,.yml"
                  type="file"
                  className="hidden"
                  onChange={(e) => setYamlFile(e.target.files?.[0] || null)}
                />
                {yamlFile && (
                  <span className="text-xs font-mono bg-sky-950 text-sky-300 px-3 py-1 rounded-full border border-sky-800">
                    {yamlFile.name}
                  </span>
                )}
              </label>

              <label className="border-2 border-dashed border-slate-800 hover:border-sky-500/60 rounded-2xl p-6 flex flex-col items-center justify-center gap-3 bg-slate-900/40 cursor-pointer transition-colors">
                <MapIcon className="text-sky-400" size={32} />
                <div className="text-center">
                  <p className="text-xs font-semibold text-slate-200">Citra Occupancy (.pgm atau .png)</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Nama file harus cocok dengan baris image: di YAML</p>
                </div>
                <input
                  id="file-input-ros-image"
                  accept=".png,.pgm"
                  type="file"
                  className="hidden"
                  onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                />
                {imageFile && (
                  <span className="text-xs font-mono bg-sky-950 text-sky-300 px-3 py-1 rounded-full border border-sky-800">
                    {imageFile.name} ({(imageFile.size / 1024).toFixed(1)} KB)
                  </span>
                )}
              </label>
            </div>

            <div className="mt-6 flex items-center justify-between pt-4 border-t border-slate-800">
              <span className="text-[11px] text-slate-500">
                Sampel uji tersedia di folder <code>samples/ros-mock-map/</code>
              </span>
              <button
                id="btn-upload-ros-map"
                disabled={!yamlFile || !imageFile || uploadBusy}
                onClick={handleUpload}
                className="bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium px-6 py-2.5 rounded-xl shadow-lg shadow-sky-600/20 transition-all flex items-center gap-2"
              >
                {uploadBusy ? 'Memvalidasi & Mengunggah...' : 'Validasi & Simpan Peta ROS 2'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT 3: SIMRS UPLOAD */}
      {tab === 'SIMRS_UPLOAD' && (
        <div className="flex-1 p-6 max-w-4xl mx-auto w-full space-y-6">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <h2 className="text-base font-bold text-white mb-1 flex items-center gap-2">
              <Database className="text-emerald-400" size={20} />
              Upload Konfigurasi Mapping SIMRS (YAML)
            </h2>
            <p className="text-xs text-slate-400 mb-6">
              Impor struktur administratif rumah sakit (bangsal, lantai, ruangan, bed). Status pratinjau lokal, tidak
              menggantikan sumber data live SIMRS resmi.
            </p>

            <label className="border-2 border-dashed border-slate-800 hover:border-emerald-500/60 rounded-2xl p-8 flex flex-col items-center justify-center gap-3 bg-slate-900/40 cursor-pointer transition-colors">
              <UploadCloud className="text-emerald-400" size={36} />
              <div className="text-center">
                <p className="text-xs font-semibold text-slate-200">Pilih File YAML SIMRS</p>
                <p className="text-[11px] text-slate-500 mt-0.5">Format: simrs-mapping.yaml (version 1)</p>
              </div>
              <input
                id="file-input-simrs-yaml"
                accept=".yaml,.yml"
                type="file"
                className="hidden"
                onChange={(e) => setYamlFile(e.target.files?.[0] || null)}
              />
              {yamlFile && (
                <span className="text-xs font-mono bg-emerald-950 text-emerald-300 px-3 py-1 rounded-full border border-emerald-800">
                  {yamlFile.name} ({(yamlFile.size / 1024).toFixed(1)} KB)
                </span>
              )}
            </label>

            <div className="mt-6 flex items-center justify-between pt-4 border-t border-slate-800">
              <span className="text-[11px] text-slate-500">
                Sampel uji: <code>samples/simrs-mapping.yaml</code> (3 bangsal, 6 ruangan)
              </span>
              <button
                id="btn-upload-simrs-yaml"
                disabled={!yamlFile || uploadBusy}
                onClick={handleUpload}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium px-6 py-2.5 rounded-xl shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-2"
              >
                {uploadBusy ? 'Mengimpor SIMRS...' : 'Impor YAML SIMRS'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT 4: AUDIT LOGS */}
      {tab === 'AUDIT' && (
        <div className="flex-1 p-6 max-w-5xl mx-auto w-full space-y-6">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <h2 className="text-base font-bold text-white mb-4 flex items-center gap-2">
              <Layers className="text-sky-400" size={20} />
              Daftar Versi Mapping & Peta yang Diunggah
            </h2>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 pb-2">
                    <th className="py-2.5 px-3">Tipe</th>
                    <th className="py-2.5 px-3">File</th>
                    <th className="py-2.5 px-3">Pengunggah</th>
                    <th className="py-2.5 px-3">Waktu</th>
                    <th className="py-2.5 px-3">Status Web</th>
                    <th className="py-2.5 px-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {records.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-900/40">
                      <td className="py-3 px-3">
                        <span
                          className={`px-2 py-0.5 rounded font-mono text-[10px] ${
                            r.kind === 'ROS'
                              ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
                              : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                          }`}
                        >
                          {r.kind}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-medium text-slate-200">
                        {r.file_name}
                        <p className="text-[10px] font-mono text-slate-500">{r.id}</p>
                      </td>
                      <td className="py-3 px-3 text-slate-400">{r.created_by}</td>
                      <td className="py-3 px-3 text-slate-400">
                        {new Date(r.created_at).toLocaleString('id-ID')}
                      </td>
                      <td className="py-3 px-3">
                        {r.active ? (
                          <span className="text-emerald-400 font-semibold flex items-center gap-1">
                            <CheckCircle2 size={13} /> Aktif di Web
                          </span>
                        ) : (
                          <span className="text-slate-500">Arsip</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right">
                        {r.kind === 'ROS' && (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                setSelectedMapId(r.id);
                                setTab('VIEWER');
                              }}
                              className="bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 px-2.5 py-1 rounded-lg transition-colors"
                            >
                              Lihat Peta
                            </button>
                            {role === 'admin' && !r.active && (
                              <button
                                onClick={() => handleActivateMap(r.id)}
                                className="bg-sky-600 hover:bg-sky-500 text-white px-2.5 py-1 rounded-lg shadow-sm"
                              >
                                Aktifkan Web
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
