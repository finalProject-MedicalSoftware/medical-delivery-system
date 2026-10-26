'use client';

import React, { useState, useEffect } from 'react';
import { useApp } from '../components/AppShell';
import { useLanguage } from '../components/LanguageProvider';
import MapViewer, { MapMetadata, WaypointItem } from '../maps/MapViewer';
import {
  Activity, Radio, AlertTriangle, Terminal, Wifi, Navigation,
} from 'lucide-react';
import { WS_URL } from '../lib/ws-config';

export default function TrackingPage() {
  const { telemetry, request, wsConnected } = useApp();
  const { dict } = useLanguage();
  const t = dict.tracking;

  const [activeMap, setActiveMap] = useState<MapMetadata | null>(null);
  const [waypoints, setWaypoints] = useState<WaypointItem[]>([]);
  const [eventLogs, setEventLogs] = useState<string[]>([]);
  const [lastHeartbeat, setLastHeartbeat] = useState<number>(Date.now());

  useEffect(() => {
    setLastHeartbeat(Date.now());
  }, [telemetry]);

  const isStale = wsConnected && Date.now() - lastHeartbeat > 3000;

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
  }, [request]);

  useEffect(() => {
    const ws = new WebSocket(WS_URL);

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'MISSION_EVENT' && msg.data) {
          const time = new Date().toLocaleTimeString();
          const line = `[${time}] [${msg.data.status}] ${msg.data.message || ''} (${msg.data.progress || 0}%)`;
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
    <div className="space-y-6">
      {/* Header */}
      <div className="glass-panel p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold txt-main flex items-center gap-2">
            <Activity className="text-accent" size={24} />
            {t.title}
          </h2>
          <p className="text-xs txt-sec mt-1">{t.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          {telemetry.simulated && (
            <span className="status-pill status-warning">{dict.common.simulated}</span>
          )}
          {isStale ? (
            <span className="status-pill status-danger flex items-center gap-1.5">
              <AlertTriangle size={13} /> {t.stale}
            </span>
          ) : wsConnected ? (
            <span className="status-pill status-success flex items-center gap-1.5">
              <Wifi size={13} className="animate-pulse" /> {t.wsStatus} · {dict.common.live}
            </span>
          ) : (
            <span className="status-pill status-warning flex items-center gap-1.5">
              <AlertTriangle size={13} /> {dict.common.connecting}
            </span>
          )}
        </div>
      </div>

      {/* Canvas & HUD */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-4">
          {activeMap ? (
            <MapViewer
              meta={activeMap}
              waypoints={waypoints}
              selectedWaypointId={null}
              onSelectWaypoint={() => {}}
              onPickCoordinate={() => {}}
              robotPose={telemetry.pose}
            />
          ) : (
            <div className="glass-panel p-12 text-center">
              <Navigation className="txt-sec mx-auto mb-3" size={32} />
              <p className="font-semibold txt-main">{t.noMap}</p>
              <p className="text-xs txt-sec mt-1">{dict.maps.noActiveMap}</p>
            </div>
          )}
        </div>

        <div className="lg:col-span-4 space-y-5">
          {/* Pose card */}
          <div className="glass-panel p-5 space-y-3">
            <h3 className="font-bold text-sm txt-main flex items-center gap-2 pb-3 border-b border-base">
              <Radio size={16} className="text-accent" />
              {t.pose}
            </h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-elevated p-3 rounded-xl border border-base">
                <span className="text-[10px] txt-sec block mb-0.5">X</span>
                <span className="font-mono text-base font-bold txt-main">{telemetry.pose.x.toFixed(3)}</span>
              </div>
              <div className="bg-elevated p-3 rounded-xl border border-base">
                <span className="text-[10px] txt-sec block mb-0.5">Y</span>
                <span className="font-mono text-base font-bold txt-main">{telemetry.pose.y.toFixed(3)}</span>
              </div>
              <div className="bg-elevated p-3 rounded-xl border border-base">
                <span className="text-[10px] txt-sec block mb-0.5">Yaw</span>
                <span className="font-mono text-base font-bold txt-accent">
                  {telemetry.pose.yaw.toFixed(2)} rad
                </span>
                <span className="text-[10px] txt-sec block">
                  ({Math.round((telemetry.pose.yaw * 180) / Math.PI)}°)
                </span>
              </div>
              <div className="bg-elevated p-3 rounded-xl border border-base">
                <span className="text-[10px] txt-sec block mb-0.5">{t.speed}</span>
                <span className="font-mono text-base font-bold txt-main">{telemetry.speed.toFixed(2)} m/s</span>
              </div>
            </div>
            <div className="p-3 bg-elevated/50 rounded-xl border border-base space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="txt-sec">{t.status}:</span>
                <strong className={`font-mono ${telemetry.status === 'NAVIGATING' ? 'text-info animate-pulse' : 'text-success'}`}>
                  {telemetry.status}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="txt-sec">{dict.common.mode}:</span>
                <strong className="txt-main">{telemetry.mode}</strong>
              </div>
              <div className="flex justify-between">
                <span className="txt-sec">{t.battery}:</span>
                <strong className={`font-mono ${telemetry.battery <= 20 ? 'text-error' : 'text-success'}`}>
                  {telemetry.battery.toFixed(1)}%
                </strong>
              </div>
            </div>
          </div>

          {/* Event console */}
          <div className="glass-panel p-5 space-y-3 flex flex-col h-[280px]">
            <div className="flex items-center justify-between pb-2 border-b border-base">
              <h3 className="font-bold text-xs txt-main flex items-center gap-2">
                <Terminal size={14} className="text-accent" />
                {t.eventLog}
              </h3>
              <span className="text-[10px] font-mono txt-sec">{t.connectedTo} {WS_URL.replace(/^ws:\/\/[^/]+/, '')}</span>
            </div>
            <div className="flex-1 overflow-y-auto font-mono text-[11px] space-y-1.5 pr-1">
              {eventLogs.length === 0 ? (
                <p className="txt-sec italic py-6 text-center">{t.noEvents}</p>
              ) : (
                eventLogs.map((logLine, idx) => (
                  <div key={idx} className="p-1.5 bg-elevated/60 rounded border border-base leading-tight txt-main">
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
