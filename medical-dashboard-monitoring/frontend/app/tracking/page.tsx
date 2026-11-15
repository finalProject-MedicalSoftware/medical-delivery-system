'use client';

import React, { useState, useEffect } from 'react';
import { PageHeading, RobotArtwork } from '../components/NevoUI';
import { useApp } from '../components/AppShell';
import { useLanguage } from '../components/LanguageProvider';
import MapViewer, { MapMetadata, WaypointItem } from '../maps/MapViewer';
import {
  Activity, Radio, AlertTriangle, Terminal, Wifi, Navigation,
} from 'lucide-react';

export default function TrackingPage() {
  const { telemetry, request, wsConnected, missionEvents, selectedRobotConnected, selectedRobotHasTelemetry } = useApp();
  const { dict } = useLanguage();
  const t = dict.tracking;

  const [activeMap, setActiveMap] = useState<MapMetadata | null>(null);
  const [waypoints, setWaypoints] = useState<WaypointItem[]>([]);
  const [eventLogs, setEventLogs] = useState<string[]>([]);
  const seenEvents = React.useRef(new Set<string>());
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
    for (const event of missionEvents) {
      const key = event.eventId || `${event.missionId || ''}:${event.status}:${event.timestamp || ''}`;
      if (seenEvents.current.has(key)) continue;
      seenEvents.current.add(key);
      const time = event.timestamp ? new Date(event.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();
      const line = `[${time}] [${event.status}] ${event.message || ''} (${event.progress || 0}%)`;
      setEventLogs((prev) => [line, ...prev.slice(0, 40)]);
    }
  }, [missionEvents]);

  return (
    <div className="space-y-6">
      <PageHeading title={t.title} description={t.subtitle} actions={<div className="flex gap-2">{telemetry.simulated && <span className="status-pill status-warning">{dict.common.simulated}</span>}{isStale && <span role="status" className="status-pill status-danger">{t.stale}</span>}{!wsConnected && <span role="status" className="status-pill status-warning">{dict.common.disconnected}</span>}</div>} />

      {/* Canvas & HUD */}
      <div className="tracking-layout grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="tracking-map lg:col-span-8 space-y-4">
          {activeMap ? (
            <MapViewer
              meta={activeMap}
              waypoints={waypoints}
              selectedWaypointId={null}
              onSelectWaypoint={() => {}}
              onPickCoordinate={() => {}}
              robotPose={selectedRobotHasTelemetry ? telemetry.pose : null}
            />
          ) : (
            <div className="map-empty">
              <Navigation className="txt-sec mx-auto mb-3" size={32} />
              <p className="font-semibold txt-main">{t.noMap}</p>
              <p className="text-xs txt-sec mt-1">{dict.maps.noActiveMap}</p>
            </div>
          )}
        </div>

        <div className="lg:col-span-4 min-w-0">
          {/* Pose card */}
          <section className="glass-panel tracking-panel p-5 space-y-3">
            <div className="tracking-identity"><RobotArtwork variant="head" /><div><strong>{telemetry.robotId || 'NEVO'}</strong><span className="status-pill status-info">{selectedRobotConnected ? telemetry.mode : dict.common.noData}</span></div></div>
            {selectedRobotHasTelemetry ? <>
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
              <div>
                <div className="flex justify-between mb-1.5">
                  <span className="txt-sec">{t.battery}:</span>
                  <strong className="font-mono txt-main">{telemetry.battery.toFixed(1)}%</strong>
                </div>
                <div className="battery-track" role="meter" aria-valuenow={Math.round(telemetry.battery)} aria-valuemin={0} aria-valuemax={100} aria-label={t.battery}>
                  <div
                    className={`battery-fill ${telemetry.battery <= 20 ? 'low' : telemetry.battery <= 40 ? 'mid' : ''}`}
                    style={{ width: `${Math.min(100, Math.max(0, telemetry.battery))}%` }}
                  />
                </div>
              </div>
            </div>
            </> : <p className="p-6 txt-sec text-sm text-center">{dict.common.noData}</p>}
          {/* Event console */}
          <div className="tracking-events pt-5 space-y-3 flex flex-col min-h-[220px]">
            <div className="flex items-center justify-between pb-2 border-b border-base">
              <h3 className="font-bold text-xs txt-main flex items-center gap-2">
                <Terminal size={14} className="text-accent" />
                {t.eventLog}
              </h3>
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
          </section>
        </div>
      </div>
    </div>
  );
}
