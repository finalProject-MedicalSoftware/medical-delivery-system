'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useApp } from '../components/AppShell';
import { useLanguage } from '../components/LanguageProvider';
import { simrsMode } from '../lib/simrs-mode';
import { statusPillClass, missionStatusLabel } from '../lib/mission-status';
import {
  Bot, Activity, Battery, BatteryCharging, MapPin, Database, Navigation,
  Clock, CheckCircle2, Radio, ArrowRight, ShieldAlert,
} from 'lucide-react';

export default function DashboardPage() {
  const { telemetry, request } = useApp();
  const { dict, language } = useLanguage();
  const t = dict.dashboard;
  const [activeMap, setActiveMap] = useState<any>(null);
  const [simrsStatus, setSimrsStatus] = useState<any>(null);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [recentMissions, setRecentMissions] = useState<any[]>([]);
  const [robots, setRobots] = useState<any[]>([]);

  useEffect(() => {
    const load = () => {
      request('mappings').then((mappings: any[]) => {
        const ros = mappings.find((m) => m.kind === 'ROS' && m.active) || mappings.find((m) => m.kind === 'ROS');
        if (ros) setActiveMap(ros);
      }).catch(() => {});
      request('integrations/simrs/status').then(setSimrsStatus).catch(() => {});
      request('integrations/simrs/deliveries').then((res: any) => setDeliveries(Array.isArray(res) ? res : res?.deliveries ?? [])).catch(() => {});
      request('robots').then((res: any) => setRobots(Array.isArray(res) ? res : [])).catch(() => {});
      request('missions?limit=5').then(setRecentMissions).catch(() => {});
    };
    load();
    const timer = window.setInterval(load, 30000);
    return () => window.clearInterval(timer);
  }, [request]);

  const greeting = (() => {
    const h = new Date().getHours();
    return h < 11 ? t.greetingMorning : h < 15 ? t.greetingAfternoon : t.greetingEvening;
  })();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass-panel p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-accent flex items-center justify-center text-white shadow-sm">
            <Bot size={26} />
          </div>
          <div>
            <h2 className="text-xl font-bold txt-main">{greeting}</h2>
            <p className="text-sm txt-sec mt-0.5">{t.subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/missions/create" className="btn-primary flex items-center gap-2">
            <Navigation size={15} /> {t.newMission}
          </Link>
          <Link href="/tracking" className="btn-secondary flex items-center gap-2">
            <Activity size={15} /> {t.openTracking}
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel card-hover p-5">
          <div className="flex items-center justify-between txt-sec mb-3">
            <span className="text-xs font-medium">{t.robotStatus}</span>
            <Radio size={16} className={telemetry.status === 'NAVIGATING' ? 'text-info animate-pulse' : 'txt-sec'} />
          </div>
          <p className="text-xl font-bold txt-main font-mono">{telemetry.status}</p>
          <p className="text-[11px] txt-sec mt-2">{robots.length} robot(s) · {robots.filter((robot) => robot.status !== 'OFFLINE').length} online</p>
          <div className="flex items-center justify-between text-xs txt-sec mt-3 pt-3 border-t border-base">
            <span>{dict.common.status}: <strong className="txt-main">{telemetry.mode}</strong></span>
            <span className={`status-pill ${telemetry.simulated ? 'status-warning' : 'status-success'}`}>
              {telemetry.simulated ? dict.common.simulated : dict.common.real}
            </span>
          </div>
        </div>

        <div className="glass-panel card-hover p-5">
          <div className="flex items-center justify-between txt-sec mb-3">
            <span className="text-xs font-medium">{dict.header.battery}</span>
            {telemetry.status === 'CHARGING' ? <BatteryCharging size={18} className="text-info" /> : <Battery size={18} className="text-success" />}
          </div>
          <p className="text-xl font-bold txt-main font-mono">{telemetry.battery.toFixed(1)}%</p>
          <div className="w-full bg-elevated h-2 rounded-full overflow-hidden mt-3">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                telemetry.battery > 50 ? 'bg-success' : telemetry.battery > 20 ? 'bg-warning' : 'bg-error'
              }`}
              style={{ width: `${Math.min(telemetry.battery, 100)}%` }}
            />
          </div>
        </div>

        <div className="glass-panel card-hover p-5">
          <div className="flex items-center justify-between txt-sec mb-3">
            <span className="text-xs font-medium">{t.activeMap}</span>
            <MapPin size={16} className="text-accent" />
          </div>
          <p className="text-sm font-bold txt-main truncate">
            {activeMap ? activeMap.file_name : dict.maps.noActiveMap}
          </p>
          <div className="flex items-center justify-between text-xs txt-sec mt-3 pt-3 border-t border-base">
            <span className="font-mono text-[11px]">
              {activeMap?.summary?.resolution ? `${activeMap.summary.resolution} m/px` : 'Res: -'}
            </span>
            <Link href="/maps" className="text-accent text-[11px] font-semibold hover:underline">{dict.common.edit}</Link>
          </div>
        </div>

        <div className="glass-panel card-hover p-5">
          <div className="flex items-center justify-between txt-sec mb-3">
            <span className="text-xs font-medium">{dict.sidebar.simrs}</span>
            <Database size={16} className="text-warning" />
          </div>
          <p className="text-sm font-bold txt-main truncate">{simrsMode(simrsStatus?.mode).label}</p>
          <div className="flex items-center justify-between text-xs txt-sec mt-3 pt-3 border-t border-base">
            <span className="text-[10px] truncate max-w-[130px]" title={simrsStatus?.host}>
              {simrsStatus?.host || 'backend env'}
            </span>
            <span className="text-warning text-[11px] font-mono">
              {simrsStatus?.writeEnabled ? 'WRITE-ON' : 'READ-ONLY'}
            </span>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 space-y-6">
          {/* Active mission banner */}
          <div className="glass-panel p-6 space-y-4">
            <h3 className="text-sm font-bold txt-main flex items-center justify-between">
              <span>{t.robotStatus}</span>
              <span className="text-[11px] font-mono txt-sec">
                {dict.tracking.pose}: ({telemetry.pose.x.toFixed(2)}m, {telemetry.pose.y.toFixed(2)}m)
              </span>
            </h3>

            {telemetry.status === 'NAVIGATING' ? (
              <div className="bg-accent-muted border border-base rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs txt-main font-semibold flex items-center gap-2">
                      <Navigation size={16} className="text-accent animate-pulse" /> {dict.missions.statusExecuting}
                    </span>
                    <p className="text-xs txt-sec mt-1 font-mono">ID: {telemetry.activeMissionId}</p>
                  </div>
                  <span className="text-xs font-mono font-bold txt-main bg-card px-2.5 py-1 rounded-lg border border-base">
                    {telemetry.speed} m/s
                  </span>
                </div>
                <div className="pt-2">
                  <Link href="/tracking" className="text-xs text-accent hover:underline font-semibold flex items-center gap-1.5">
                    {t.openTracking} <ArrowRight size={14} />
                  </Link>
                </div>
              </div>
            ) : (
              <div className="bg-elevated border border-base rounded-xl p-6 text-center txt-sec space-y-2">
                <CheckCircle2 size={32} className="mx-auto text-success" />
                <p className="text-sm font-semibold txt-main">{dict.tracking.status}: {telemetry.status}</p>
                <p className="text-xs max-w-md mx-auto">{t.subtitle}</p>
              </div>
            )}
          </div>

          {/* Recent missions */}
          <div className="glass-panel p-6">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-base">
              <h3 className="text-sm font-bold txt-main flex items-center gap-2">
                <Clock size={16} className="text-accent" /> {t.recentMissions}
              </h3>
              <Link href="/missions" className="text-xs text-accent hover:underline font-medium">{t.viewAll}</Link>
            </div>
            <div className="space-y-2.5 text-xs">
              {recentMissions.length === 0 ? (
                <p className="txt-sec italic py-3 text-center">{t.noMissions}</p>
              ) : (
                recentMissions.map((m) => (
                  <div key={m.id} className="p-3 bg-elevated border border-base rounded-xl flex items-center justify-between">
                    <div>
                      <div className="font-semibold txt-main flex items-center gap-2">
                        <span>{m.waypointName || m.roomCode || dict.maps.waypoints}</span>
                        {m.requestCode && (
                          <span className="text-[10px] bg-card txt-sec px-1.5 py-0.5 rounded font-mono border border-base">
                            {m.requestCode}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] txt-sec mt-0.5">
                        {new Date(m.createdAt).toLocaleTimeString(language === 'id' ? 'id-ID' : 'en-US')} · {m.createdBy}
                      </p>
                    </div>
                    <span className={`status-pill ${statusPillClass(m.status)}`}>{missionStatusLabel(m.status, dict)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* SIMRS deliveries */}
        <div className="lg:col-span-5 space-y-6">
          <div className="glass-panel p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-base">
              <h3 className="text-sm font-bold txt-main flex items-center gap-2">
                <Database size={16} className="text-warning" /> {t.simrsDeliveries}
              </h3>
              <Link href="/simrs" className="text-xs text-accent hover:underline font-medium">{dict.common.refresh}</Link>
            </div>
            <div className="space-y-3 text-xs">
              {deliveries.length === 0 ? (
                <p className="txt-sec italic py-4 text-center">{t.pendingDeliveries}</p>
              ) : (
                deliveries.map((del) => (
                  <div key={del.requestCode} className="p-3.5 bg-elevated border border-base rounded-xl space-y-2 card-hover">
                    <div className="flex items-center justify-between">
                      <span className="font-bold txt-main">{del.roomName || del.roomCode}</span>
                      <span className="text-[10px] font-mono bg-card txt-sec px-2 py-0.5 rounded border border-base">
                        {del.requestCode}
                      </span>
                    </div>
                    <p className="txt-sec text-[11px]">
                      {t.patient}: <strong className="txt-main">{del.patientName ?? del.patient?.fullName ?? '—'}</strong> ({del.patientMrn ?? del.mrn ?? del.patient?.mrn ?? '—'})
                    </p>
                    <p className="txt-sec text-[11px] truncate">{t.medicine}: {del.medicineName ?? del.medicine ?? del.prescription?.medicineName ?? '—'}</p>
                    {del.isInfectious && (
                      <div className="bg-error/10 border border-error/30 text-error text-[11px] p-2 rounded-lg flex items-center gap-1.5 font-medium">
                        <ShieldAlert size={14} className="shrink-0" />
                        <span>{t.infectious} — APD</span>
                      </div>
                    )}
                    <div className="pt-1 flex items-center justify-between">
                      <span className="status-pill status-info">{del.status}</span>
                      <Link
                        href={`/missions/create?room=${del.roomCode}&req=${del.requestCode}`}
                        className="text-[11px] bg-card hover:bg-card border border-base text-accent px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1"
                      >
                        {t.newMission} <ArrowRight size={12} />
                      </Link>
                    </div>
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
