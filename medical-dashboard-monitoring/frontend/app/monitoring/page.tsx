'use client';

import React, { useState, useEffect } from 'react';
import { useApp } from '../components/AppShell';
import MapViewer, { MapMetadata, WaypointItem } from '../mapping/MapViewer';
import {
  Activity,
  Radio,
  Battery,
  Compass,
  AlertTriangle,
  Clock,
  Terminal,
  Wifi,
  Navigation,
} from 'lucide-react';
import { WS_PORT_LABEL, WS_URL } from '../lib/ws-config';

export default function MonitoringPage() {
  const { telemetry, authHeader, request, wsConnected } = useApp();

  const [activeMap, setActiveMap] = useState<MapMetadata | null>(null);
  const [waypoints, setWaypoints] = useState<WaypointItem[]>([]);
  const [eventLogs, setEventLogs] = useState<string[]>([]);
  const [lastHeartbeat, setLastHeartbeat] = useState<number>(Date.now());

  // Track heartbeat timestamp
  useEffect(() => {
    setLastHeartbeat(Date.now());
  }, [telemetry]);

  // Stale detection
  const isStale = wsConnected && Date.now() - lastHeartbeat > 3000;

  // Load active map & waypoints
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
      .catch(() => {});
  }, []);

  // Listen to WebSocket events for mission console
  useEffect(() => {
    const ws = new WebSocket(WS_URL);

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'MISSION_EVENT' && msg.data) {
          const time = new Date().toLocaleTimeString('id-ID');
          const line = `[${time}] [${msg.data.status}] ${msg.data.message || ''} (Progress: ${msg.data.progress || 0}%)`;
          setEventLogs((prev) => [line, ...prev.slice(0, 40)]);
        }
      } catch {
        // ignore
      }
    };

    return () => {
      ws.close();
    };
  }, []);

  return (
    <div className="space-y-8">
      {/* Top Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-6 bg-white p-7 rounded-2xl border border-neutral-200 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-neutral-900 flex items-center gap-2">
            <Activity className="text-blue-600" size={24} />
            Monitoring Telemetri & Pose Live Robot NEVO
            <span className="text-[10px] bg-amber-50 text-amber-800 border border-amber-200 px-2 py-1 rounded-full font-semibold">
              SIMULASI WEB
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Visualisasi posisi pergerakan real-time robot di atas occupancy grid ROS 2
          </p>
        </div>

        {/* Live Stale / Connection Status */}
        <div className="flex items-center gap-3">
          {isStale ? (
            <span className="bg-rose-500/15 text-rose-300 border border-rose-500/30 text-xs px-3 py-1.5 rounded-xl font-semibold flex items-center gap-1.5">
              <AlertTriangle size={15} /> Telemetri Stale (&gt;3 detik)
            </span>
          ) : wsConnected ? (
            <span className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-xs px-3 py-1.5 rounded-xl font-semibold flex items-center gap-1.5">
              <Wifi size={15} className="animate-pulse" /> Telemetri Streaming Live (0.5s)
            </span>
          ) : (
            <span className="bg-amber-500/15 text-amber-300 border border-amber-500/30 text-xs px-3 py-1.5 rounded-xl font-semibold flex items-center gap-1.5">
              <AlertTriangle size={15} /> Menghubungkan WebSocket...
            </span>
          )}
        </div>
      </div>

      {/* Main Monitoring Canvas & Telemetry HUD */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Full-width Canvas with live robot overlay (8 cols) */}
        <div className="lg:col-span-8 space-y-4">
          {activeMap ? (
            <MapViewer
              meta={activeMap}
              waypoints={waypoints}
              selectedWaypointId={null}
              onSelectWaypoint={() => {}}
              onPickCoordinate={() => {}}
              authHeader={authHeader}
              robotPose={telemetry.pose}
            />
          ) : (
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-12 text-center text-slate-400">
              <p className="font-semibold text-white">Belum Ada Peta Navigasi ROS 2</p>
              <p className="text-xs mt-1 text-slate-400">Unggah peta pada menu Peta & Waypoint.</p>
            </div>
          )}
        </div>

        {/* Right HUD & Event Console (4 cols) */}
        <div className="lg:col-span-4 space-y-5">
          {/* Detailed Pose Card */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
            <h3 className="font-bold text-sm text-white flex items-center gap-2 pb-3 border-b border-slate-800">
              <Radio size={16} className="text-sky-400" />
              Telemetri Robot NEVO-01
            </h3>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 block mb-0.5">Koordinat X (m)</span>
                <span className="font-mono text-base font-bold text-white">{telemetry.pose.x.toFixed(3)}</span>
              </div>
              <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 block mb-0.5">Koordinat Y (m)</span>
                <span className="font-mono text-base font-bold text-white">{telemetry.pose.y.toFixed(3)}</span>
              </div>
              <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 block mb-0.5">Orientasi Yaw</span>
                <span className="font-mono text-base font-bold text-sky-300">
                  {telemetry.pose.yaw.toFixed(2)} rad
                </span>
                <span className="text-[10px] text-slate-500 block">
                  ({Math.round((telemetry.pose.yaw * 180) / Math.PI)}°)
                </span>
              </div>
              <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 block mb-0.5">Kecepatan Linier</span>
                <span className="font-mono text-base font-bold text-white">{telemetry.speed.toFixed(2)} m/s</span>
              </div>
            </div>

            <div className="p-3 bg-slate-900/50 rounded-xl border border-slate-800/80 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Status Gerak:</span>
                <strong className={`font-mono ${telemetry.status === 'NAVIGATING' ? 'text-sky-400 animate-pulse' : 'text-emerald-400'}`}>
                  {telemetry.status}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Mode Kendali:</span>
                <strong className="text-slate-200">{telemetry.mode}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Kapasitas Baterai:</span>
                <strong className="font-mono text-emerald-400">{telemetry.battery.toFixed(1)}%</strong>
              </div>
            </div>
          </div>

          {/* Real-time Mission Event Stream Console */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3 flex flex-col h-[280px]">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="font-bold text-xs text-white flex items-center gap-2">
                <Terminal size={14} className="text-emerald-400" />
                Live Event Console
              </h3>
              <span className="text-[10px] font-mono text-slate-500">WebSocket {WS_URL.replace(/^ws:\/\/[^/]+/, '')} · port {WS_PORT_LABEL}</span>
            </div>

            <div className="flex-1 overflow-y-auto font-mono text-[11px] space-y-1.5 pr-1 text-slate-300">
              {eventLogs.length === 0 ? (
                <p className="text-slate-600 italic py-6 text-center">Menunggu event misi real-time...</p>
              ) : (
                eventLogs.map((logLine, idx) => (
                  <div key={idx} className="p-1.5 bg-slate-900/60 rounded border border-slate-800/60 leading-tight">
                    {logLine}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
