'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  UploadCloud,
  Map as MapIcon,
  Database,
  MapPin,
  RefreshCw,
  CheckCircle2,
  Plus,
  Trash2,
  Edit2,
  Power,
  Layers,
  Check,
  ExternalLink,
  X,
} from 'lucide-react';
import MapViewer, { MapMetadata, WaypointItem } from './MapViewer';
import { useApp } from '../components/AppShell';
import { useLanguage } from '../components/LanguageProvider';

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

const YAW_PRESETS: [string, 'presetFront' | 'presetLeft' | 'presetBack' | 'presetRight'][] = [
  ['0.00', 'presetFront'],
  ['1.57', 'presetLeft'],
  ['3.14', 'presetBack'],
  ['-1.57', 'presetRight'],
];

export default function MapsPage() {
  const { user, request } = useApp();
  const { dict, language } = useLanguage();
  const t = dict.maps;
  const locale = language === 'id' ? 'id-ID' : 'en-US';
  const isAdmin = (user?.role || '').toUpperCase() === 'ADMIN';

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

  // Notification message (local toast)
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
      notify('error', `${t.loadFail}: ${err.message}`);
    }
  }, [request, t.loadFail]);

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
        notify('error', `${t.loadDetailFail}: ${err.message}`);
      });

    return () => {
      active = false;
    };
  }, [selectedMapId, request, t.loadDetailFail]);

  // Handle map canvas click coordinates
  const handleCanvasPick = (x: number, y: number) => {
    setWpX(x.toFixed(3));
    setWpY(y.toFixed(3));
    notify('info', t.coordCopied.replace('{x}', x.toFixed(3)).replace('{y}', y.toFixed(3)));
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
        if (!imageFile) throw new Error(t.pgmHint);
        form.append('yaml', yamlFile);
        form.append('image', imageFile);
        endpoint = 'maps/import';
      }

      const res = await request(endpoint, { method: 'POST', body: form });
      notify('success', `${t.importSuccess} (ID: ${res.id})`);
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
    if (!isAdmin) {
      notify('error', t.adminOnly);
      return;
    }
    if (!window.confirm(`${t.activateConfirm}\n\n${t.activateNote}`)) {
      return;
    }

    try {
      await request(`maps/${id}/activate`, { method: 'POST' });
      notify('success', t.activateSuccess);
      await loadInitialData();
    } catch (err: any) {
      notify('error', `${t.activate}: ${err.message}`);
    }
  };

  // Waypoint Form: Save (Create or Update)
  const handleSaveWaypoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMapId) {
      notify('error', t.selectMapFirst);
      return;
    }
    if (!wpName.trim()) {
      notify('error', t.nameRequired);
      return;
    }
    const xVal = parseFloat(wpX);
    const yVal = parseFloat(wpY);
    const yawVal = parseFloat(wpYaw);
    if (isNaN(xVal) || isNaN(yVal) || isNaN(yawVal)) {
      notify('error', t.coordInvalid);
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
        notify('success', t.waypointUpdated.replace('{name}', wpName));
      } else {
        await request(`maps/${selectedMapId}/waypoints`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        notify('success', t.waypointAdded.replace('{name}', wpName));
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
      notify('info', t.toggleInfo.replace('{state}', res.enabled ? t.enable : t.disable));
      const updatedWps = await request(`maps/${selectedMapId}/waypoints`);
      setWaypoints(updatedWps);
    } catch (err: any) {
      notify('error', err.message);
    }
  };

  // Delete Waypoint
  const handleDeleteWaypoint = async (wpId: string, name: string) => {
    if (!window.confirm(t.waypointDeleteConfirm.replace('{name}', name))) return;
    try {
      await request(`maps/${selectedMapId}/waypoints/${wpId}`, { method: 'DELETE' });
      notify('success', t.waypointDeleted.replace('{name}', name));
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
    notify('info', t.mappingRoomMode.replace('{name}', room.name));
  };

  const rosMaps = records.filter((r) => r.kind === 'ROS');

  const TABS: { id: typeof tab; label: string; icon: typeof MapIcon }[] = [
    { id: 'VIEWER', label: t.tabViewer, icon: MapIcon },
    { id: 'ROS_UPLOAD', label: t.tabRosUpload, icon: UploadCloud },
    { id: 'SIMRS_UPLOAD', label: t.tabSimrsUpload, icon: Database },
    { id: 'AUDIT', label: t.tabAudit, icon: Layers },
  ];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="glass-panel p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold txt-main flex items-center gap-2">
            <MapIcon className="text-accent" size={24} />
            {t.title}
          </h2>
          <p className="text-sm txt-sec mt-1">{t.subtitle}</p>
        </div>
        <button
          onClick={loadInitialData}
          title={t.title}
          className="btn-ghost text-xs flex items-center gap-1.5"
        >
          <RefreshCw size={15} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-base">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-all border-b-2 ${
              tab === id
                ? 'bg-card text-accent border-accent'
                : 'txt-sec border-transparent hover:txt-main hover:bg-elevated'
            }`}
          >
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      {/* Local toast */}
      {message && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between text-xs ${
            message.type === 'success'
              ? 'bg-card border-success/40 text-success'
              : message.type === 'error'
              ? 'bg-card border-error/40 text-error'
              : 'bg-card border-accent/40 text-accent'
          }`}
        >
          <span className="font-medium">{message.text}</span>
          <button
            onClick={() => setMessage(null)}
            className="txt-sec hover:txt-main ml-4"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* TAB 1: VIEWER & WAYPOINTS */}
      {tab === 'VIEWER' && (
        <div className="space-y-6">
          {/* Map Selector & Activation Bar */}
          <div className="glass-panel p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <label className="text-xs txt-sec font-medium">{t.selectRosMap}:</label>
              <select
                value={selectedMapId}
                onChange={(e) => setSelectedMapId(e.target.value)}
                className="bg-input border border-base text-sm txt-main rounded-xl px-3 py-2 focus:outline-none focus:border-accent font-mono"
              >
                {rosMaps.length === 0 ? (
                  <option value="">{t.emptyRosMap}</option>
                ) : (
                  rosMaps.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.file_name} · {m.id.slice(0, 8)} {m.active ? `★ (${t.activeOnWeb})` : ''}
                    </option>
                  ))
                )}
              </select>
            </div>

            {selectedMapMeta && (
              <div className="flex items-center gap-3">
                {selectedMapMeta.active ? (
                  <span className="status-pill status-success flex items-center gap-1.5">
                    <CheckCircle2 size={15} /> {t.activeOnWeb}
                  </span>
                ) : (
                  <button
                    disabled={!isAdmin}
                    onClick={() => handleActivateMap(selectedMapId)}
                    title={isAdmin ? t.activate : t.adminOnly}
                    className={isAdmin ? 'btn-primary text-xs flex items-center gap-1.5' : 'btn-secondary text-xs flex items-center gap-1.5 cursor-not-allowed opacity-60'}
                  >
                    <Power size={14} /> {t.activate}
                  </button>
                )}
                <a
                  href={`/api/proxy/maps/${selectedMapId}/preview`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-ghost text-xs flex items-center gap-1.5"
                >
                  <ExternalLink size={14} /> {t.previewPng}
                </a>
              </div>
            )}
          </div>

          {/* Grid: Interactive Map Canvas + Management Panel */}
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
                />
                <p className="text-[11px] txt-sec flex items-center gap-1.5">
                  <MapPin size={12} className="text-accent" />
                  {t.pickHint}
                </p>
              </div>

              {/* Waypoints & Rooms Sidebar (5 cols) */}
              <div className="lg:col-span-5 space-y-5">
                {/* Add/Edit Waypoint Card */}
                <div className="glass-panel p-5">
                  <div className="flex items-center justify-between mb-4 pb-3 border-b border-base">
                    <h3 className="font-semibold text-sm flex items-center gap-2 txt-main">
                      <MapPin size={16} className="text-accent" />
                      {editingWpId ? t.editWaypoint : t.addWaypoint}
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
                        className="text-xs txt-sec hover:txt-main"
                      >
                        {t.cancelMapping}
                      </button>
                    )}
                  </div>

                  <form onSubmit={handleSaveWaypoint} className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] txt-sec font-medium block mb-1">
                          {t.roomCode}
                        </label>
                        <select
                          value={wpRoomCode}
                          onChange={(e) => {
                            setWpRoomCode(e.target.value);
                            const matchedRoom = rooms.find((r) => r.roomCode === e.target.value);
                            if (matchedRoom && !wpName) {
                              setWpName(matchedRoom.name);
                            }
                          }}
                          className="w-full bg-input border border-base text-xs txt-main rounded-xl p-2.5 focus:outline-none focus:border-accent"
                        >
                          <option value="">{t.noRoomRelation}</option>
                          {rooms.map((r) => (
                            <option key={r.roomCode} value={r.roomCode}>
                              {r.roomCode} - {r.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="text-[11px] txt-sec font-medium block mb-1">
                          {t.waypointName} <span className="text-error">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={wpName}
                          onChange={(e) => setWpName(e.target.value)}
                          className="w-full bg-input border border-base text-xs txt-main rounded-xl p-2.5 focus:outline-none focus:border-accent"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="text-[11px] txt-sec font-medium block mb-1">
                          {t.axisX} <span className="text-error">*</span>
                        </label>
                        <input
                          type="number"
                          step="0.001"
                          required
                          value={wpX}
                          onChange={(e) => setWpX(e.target.value)}
                          placeholder="-2.50"
                          className="w-full bg-input border border-base text-xs font-mono txt-main rounded-xl p-2.5 focus:outline-none focus:border-accent"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] txt-sec font-medium block mb-1">
                          {t.axisY} <span className="text-error">*</span>
                        </label>
                        <input
                          type="number"
                          step="0.001"
                          required
                          value={wpY}
                          onChange={(e) => setWpY(e.target.value)}
                          placeholder="4.10"
                          className="w-full bg-input border border-base text-xs font-mono txt-main rounded-xl p-2.5 focus:outline-none focus:border-accent"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] txt-sec font-medium block mb-1">
                          {t.yaw} <span className="text-error">*</span>
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          required
                          value={wpYaw}
                          onChange={(e) => setWpYaw(e.target.value)}
                          placeholder="0.00"
                          className="w-full bg-input border border-base text-xs font-mono txt-main rounded-xl p-2.5 focus:outline-none focus:border-accent"
                        />
                      </div>
                    </div>

                    {/* Quick orientation buttons */}
                    <div className="flex items-center gap-1.5 pt-1 flex-wrap">
                      <span className="text-[10px] txt-sec">{t.yawPreset}:</span>
                      {YAW_PRESETS.map(([val, key]) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setWpYaw(val)}
                          className="text-[10px] bg-elevated hover:bg-input border border-base txt-sec hover:txt-main px-2 py-0.5 rounded-md"
                        >
                          {t[key]}
                        </button>
                      ))}
                    </div>

                    <button
                      type="submit"
                      className="btn-primary w-full mt-2 text-xs flex items-center justify-center gap-2"
                    >
                      {editingWpId ? <Check size={16} /> : <Plus size={16} />}
                      {editingWpId ? t.updateWaypoint : t.saveWaypoint}
                    </button>
                  </form>
                </div>

                {/* Waypoint List & Room Directory */}
                <div className="glass-panel p-5 flex flex-col h-[320px]">
                  <div className="flex items-center justify-between pb-3 border-b border-base">
                    <span className="font-semibold text-xs txt-main">
                      {t.waypoints} ({waypoints.length}) · {t.roomsTitle} ({rooms.length})
                    </span>
                  </div>

                  <div className="flex-1 overflow-y-auto pr-1 mt-2 text-xs">
                    {/* Waypoints section */}
                    <div className="mb-3">
                      <p className="text-[11px] font-bold text-accent uppercase tracking-wider mb-2">
                        {t.waypointList}
                      </p>
                      {waypoints.length === 0 ? (
                        <p className="txt-sec italic py-2">{t.waypointEmpty}</p>
                      ) : (
                        waypoints.map((wp) => (
                          <div
                            key={wp.id}
                            className={`p-2.5 rounded-xl my-1 transition-all flex items-center justify-between gap-3 border ${
                              selectedWpId === wp.id
                                ? 'bg-accent-muted border-accent txt-main'
                                : 'bg-card border-base hover:bg-elevated txt-main'
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
                                <span className={wp.enabled ? 'txt-accent' : 'txt-sec line-through'}>
                                  {wp.name}
                                </span>
                                {wp.room_code && (
                                  <span className="text-[10px] bg-elevated txt-sec px-1.5 py-0.5 rounded">
                                    {wp.room_code}
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] font-mono txt-sec">
                                ({wp.x.toFixed(2)}m, {wp.y.toFixed(2)}m) · yaw: {wp.yaw.toFixed(2)}
                              </p>
                            </div>

                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleToggleWaypoint(wp.id)}
                                title={wp.enabled ? t.disable : t.enable}
                                className={`p-1.5 rounded-lg border transition-colors ${
                                  wp.enabled
                                    ? 'bg-success/10 text-success border-success/40 hover:bg-success/20'
                                    : 'bg-elevated txt-sec border-base hover:txt-main'
                                }`}
                              >
                                <Power size={13} />
                              </button>
                              <button
                                onClick={() => startEditWaypoint(wp)}
                                title={t.editWaypoint}
                                className="p-1.5 rounded-lg border border-base bg-elevated txt-sec hover:txt-main transition-colors"
                              >
                                <Edit2 size={13} />
                              </button>
                              <button
                                onClick={() => handleDeleteWaypoint(wp.id, wp.name)}
                                title={t.waypointDeleted.replace('{name}', wp.name)}
                                className="p-1.5 rounded-lg border border-error/40 bg-error/10 text-error hover:bg-error/20 transition-colors"
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
                      <p className="text-[11px] font-bold txt-sec uppercase tracking-wider mb-2">
                        {t.roomsTitle}
                      </p>
                      {rooms.length === 0 ? (
                        <p className="txt-sec italic py-2">{t.roomsEmpty}</p>
                      ) : (
                        rooms.map((room) => {
                          const matchedWp = waypoints.find((w) => w.room_code === room.roomCode);
                          return (
                            <div
                              key={room.roomCode}
                              className="p-2 rounded-xl my-1 bg-card border border-base flex items-center justify-between text-xs"
                            >
                              <div>
                                <span className="font-medium txt-main">{room.name}</span>
                                <span className="text-[10px] txt-sec ml-2">
                                  [{room.roomCode}] · {room.wardName}
                                </span>
                              </div>
                              {room.availableInSimrs === false ? (
                                <span className="status-pill status-danger text-[10px]">
                                  {t.needReconcile}
                                </span>
                              ) : matchedWp ? (
                                <button
                                  onClick={() => {
                                    setSelectedWpId(matchedWp.id);
                                    startEditWaypoint(matchedWp);
                                  }}
                                  className="status-pill status-success text-[10px] flex items-center gap-1"
                                >
                                  <Check size={12} /> {t.mapped}
                                </button>
                              ) : (
                                <button
                                  onClick={() => startMappingRoom(room)}
                                  className="status-pill status-warning text-[10px] flex items-center gap-1 transition-colors"
                                >
                                  <Plus size={12} /> {t.mapRoom}
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
            <div className="glass-panel p-12 text-center txt-sec">
              <MapIcon size={48} className="mx-auto txt-sec mb-3" />
              <p className="text-base font-semibold txt-main">{t.noMapTitle}</p>
              <p className="text-xs max-w-md mx-auto mt-1 mb-4">{t.noMapHint}</p>
              <button
                onClick={() => setTab('ROS_UPLOAD')}
                className="btn-primary text-xs"
              >
                {t.uploadNow}
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: ROS MAP UPLOAD */}
      {tab === 'ROS_UPLOAD' && (
        <div className="max-w-4xl mx-auto w-full space-y-6">
          <div className="glass-panel p-6">
            <h2 className="text-base font-bold txt-main mb-1 flex items-center gap-2">
              <UploadCloud className="text-accent" size={20} />
              {t.importRos}
            </h2>
            <p className="text-xs txt-sec mb-6">{t.rosUploadHint}</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="border-2 border-dashed border-base hover:border-accent rounded-2xl p-6 flex flex-col items-center justify-center gap-3 bg-card cursor-pointer transition-colors">
                <UploadCloud className="text-accent" size={32} />
                <div className="text-center">
                  <p className="text-xs font-semibold txt-main">{t.yamlFile}</p>
                  <p className="text-[11px] txt-sec mt-0.5">{t.yamlHint}</p>
                </div>
                <input
                  accept=".yaml,.yml"
                  type="file"
                  className="hidden"
                  onChange={(e) => setYamlFile(e.target.files?.[0] || null)}
                />
                {yamlFile && (
                  <span className="text-xs font-mono bg-accent-muted text-accent px-3 py-1 rounded-full border border-accent">
                    {yamlFile.name}
                  </span>
                )}
              </label>

              <label className="border-2 border-dashed border-base hover:border-accent rounded-2xl p-6 flex flex-col items-center justify-center gap-3 bg-card cursor-pointer transition-colors">
                <MapIcon className="text-accent" size={32} />
                <div className="text-center">
                  <p className="text-xs font-semibold txt-main">{t.pgmFile}</p>
                  <p className="text-[11px] txt-sec mt-0.5">{t.pgmHint}</p>
                </div>
                <input
                  accept=".png,.pgm"
                  type="file"
                  className="hidden"
                  onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                />
                {imageFile && (
                  <span className="text-xs font-mono bg-accent-muted text-accent px-3 py-1 rounded-full border border-accent">
                    {imageFile.name} ({(imageFile.size / 1024).toFixed(1)} KB)
                  </span>
                )}
              </label>
            </div>

            <div className="mt-6 flex items-center justify-between pt-4 border-t border-base">
              <span className="text-[11px] txt-sec">{t.sampleRos}</span>
              <button
                disabled={!yamlFile || !imageFile || uploadBusy}
                onClick={handleUpload}
                className="btn-primary text-xs flex items-center gap-2"
              >
                {uploadBusy ? t.uploading : t.validateSave}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: SIMRS UPLOAD */}
      {tab === 'SIMRS_UPLOAD' && (
        <div className="max-w-4xl mx-auto w-full space-y-6">
          <div className="glass-panel p-6">
            <h2 className="text-base font-bold txt-main mb-1 flex items-center gap-2">
              <Database className="text-accent" size={20} />
              {t.importSimrs}
            </h2>
            <p className="text-xs txt-sec mb-6">{t.simrsHint}</p>

            <label className="border-2 border-dashed border-base hover:border-accent rounded-2xl p-8 flex flex-col items-center justify-center gap-3 bg-card cursor-pointer transition-colors">
              <UploadCloud className="text-accent" size={36} />
              <div className="text-center">
                <p className="text-xs font-semibold txt-main">{t.yamlFile}</p>
                <p className="text-[11px] txt-sec mt-0.5">{t.simrsFormat}</p>
              </div>
              <input
                accept=".yaml,.yml"
                type="file"
                className="hidden"
                onChange={(e) => setYamlFile(e.target.files?.[0] || null)}
              />
              {yamlFile && (
                <span className="text-xs font-mono bg-accent-muted text-accent px-3 py-1 rounded-full border border-accent">
                  {yamlFile.name} ({(yamlFile.size / 1024).toFixed(1)} KB)
                </span>
              )}
            </label>

            <div className="mt-6 flex items-center justify-between pt-4 border-t border-base">
              <span className="text-[11px] txt-sec">{t.sampleSimrs}</span>
              <button
                disabled={!yamlFile || uploadBusy}
                onClick={handleUpload}
                className="btn-primary text-xs flex items-center gap-2"
              >
                {uploadBusy ? t.uploading : t.importSimrs}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: AUDIT LOG */}
      {tab === 'AUDIT' && (
        <div className="max-w-5xl mx-auto w-full space-y-6">
          <div className="glass-panel p-6">
            <h2 className="text-base font-bold txt-main mb-4 flex items-center gap-2">
              <Layers className="text-accent" size={20} />
              {t.auditLog}
            </h2>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-base txt-sec pb-2">
                    <th className="py-2.5 px-3">{t.tableType}</th>
                    <th className="py-2.5 px-3">{t.tableFile}</th>
                    <th className="py-2.5 px-3">{t.tableUploader}</th>
                    <th className="py-2.5 px-3">{t.tableTime}</th>
                    <th className="py-2.5 px-3">{t.activeOnWeb}</th>
                    <th className="py-2.5 px-3 text-right">{t.tableActions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-base">
                  {records.map((r) => (
                    <tr key={r.id} className="hover:bg-elevated">
                      <td className="py-3 px-3">
                        <span
                          className={`px-2 py-0.5 rounded font-mono text-[10px] ${
                            r.kind === 'ROS'
                              ? 'bg-accent-muted text-accent border border-accent/40'
                              : 'bg-success/20 text-success border border-success/40'
                          }`}
                        >
                          {r.kind}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-medium txt-main">
                        {r.file_name}
                        <p className="text-[10px] font-mono txt-sec">{r.id}</p>
                      </td>
                      <td className="py-3 px-3 txt-sec">{r.created_by}</td>
                      <td className="py-3 px-3 txt-sec">
                        {new Date(r.created_at).toLocaleString(locale)}
                      </td>
                      <td className="py-3 px-3">
                        {r.active ? (
                          <span className="text-success font-semibold flex items-center gap-1">
                            <CheckCircle2 size={13} /> {t.activeOnWeb}
                          </span>
                        ) : (
                          <span className="txt-sec">{t.webArchive}</span>
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
                              className="btn-ghost text-xs"
                            >
                              {t.viewMap}
                            </button>
                            {isAdmin && !r.active && (
                              <button
                                onClick={() => handleActivateMap(r.id)}
                                className="btn-primary text-xs"
                              >
                                {t.activateWeb}
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
    </div>
  );
}
