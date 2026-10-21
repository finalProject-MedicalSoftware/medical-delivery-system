'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useApp } from '../components/AppShell';
import {
  Bot,
  Activity,
  Battery,
  MapPin,
  Database,
  Navigation,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Radio,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';

export default function DashboardPage() {
  const { telemetry, request } = useApp();
  const [activeMap, setActiveMap] = useState<any>(null);
  const [simrsStatus, setSimrsStatus] = useState<any>(null);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [recentMissions, setRecentMissions] = useState<any[]>([]);

  useEffect(() => {
    const load = () => {
      request('mappings').then((mappings: any[]) => {
        const ros = mappings.find((m) => m.kind === 'ROS' && m.active) || mappings.find((m) => m.kind === 'ROS');
        if (ros) setActiveMap(ros);
      }).catch(() => {});
      request('integrations/simrs/status').then(setSimrsStatus).catch(() => {});
      request('integrations/simrs/deliveries').then(setDeliveries).catch(() => {});
      request('missions?limit=5').then(setRecentMissions).catch(() => {});
    };
    load();
    const timer = window.setInterval(load, 30000);
    return () => window.clearInterval(timer);
  }, [request]);

  return (
    <div className="space-y-8">
      {/* Welcome & System Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-6 bg-white p-7 rounded-2xl border border-neutral-200 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-sm">
            <Bot size={28} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-neutral-900 flex items-center gap-2">
              NEVO Dashboard Monitoring
              <span className="text-[10px] bg-amber-50 text-amber-800 border border-amber-200 px-2 py-1 rounded-full font-semibold tracking-wide">
                SIMULASI WEB
              </span>
            </h2>
            <p className="text-sm text-neutral-500 mt-1">
              Sistem Pengawasan Otonom & Navigasi Distribusi Farmasi Rumah Sakit
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/control"
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg flex items-center gap-2 transition-colors"
          >
            <Navigation size={15} /> Mulai Misi Baru
          </Link>
          <Link
            href="/monitoring"
            className="bg-white hover:bg-neutral-50 border border-neutral-300 text-neutral-700 text-sm font-semibold px-4 py-2.5 rounded-lg flex items-center gap-2 transition-colors"
          >
            <Activity size={15} /> Buka Live Map
          </Link>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Robot Status */}
        <div className="bg-white border border-neutral-200 p-5 rounded-xl shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <span className="text-xs font-medium">Status Robot</span>
            <Radio size={16} className={telemetry.status === 'NAVIGATING' ? 'text-sky-400 animate-pulse' : 'text-slate-500'} />
          </div>
          <p className="text-xl font-bold text-white font-mono">{telemetry.status}</p>
          <div className="flex items-center justify-between text-xs text-slate-400 mt-3 pt-3 border-t border-slate-800/80">
            <span>Mode: <strong className="text-slate-200">{telemetry.mode}</strong></span>
            <span className="text-emerald-400 font-semibold">Online (Sim)</span>
          </div>
        </div>

        {/* Battery & Power */}
        <div className="bg-white border border-neutral-200 p-5 rounded-xl shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <span className="text-xs font-medium">Kapasitas Baterai</span>
            <Battery size={18} className="text-emerald-400" />
          </div>
          <p className="text-xl font-bold text-white font-mono">{telemetry.battery.toFixed(1)}%</p>
          <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden mt-3">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                telemetry.battery > 50 ? 'bg-emerald-500' : telemetry.battery > 20 ? 'bg-amber-500' : 'bg-rose-500'
              }`}
              style={{ width: `${Math.min(telemetry.battery, 100)}%` }}
            />
          </div>
        </div>

        {/* Active ROS Map */}
        <div className="bg-white border border-neutral-200 p-5 rounded-xl shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <span className="text-xs font-medium">Peta Navigasi ROS 2</span>
            <MapPin size={16} className="text-sky-400" />
          </div>
          <p className="text-sm font-bold text-white truncate">
            {activeMap ? activeMap.file_name : 'Belum Ada Peta Aktif'}
          </p>
          <div className="flex items-center justify-between text-xs text-slate-400 mt-3 pt-3 border-t border-slate-800/80">
            <span className="font-mono text-[11px] text-slate-300">
              {activeMap?.summary?.resolution ? `${activeMap.summary.resolution} m/px` : 'Res: -'}
            </span>
            <span className="text-sky-400 text-[11px] font-semibold">Aktif di Web</span>
          </div>
        </div>

        {/* SIMRS Integration */}
        <div className="bg-white border border-neutral-200 p-5 rounded-xl shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <span className="text-xs font-medium">SIMRS Dummy Publik</span>
            <Database size={16} className="text-amber-400" />
          </div>
          <p className="text-sm font-bold text-white truncate">
            {simrsStatus?.mode === 'LIVE_READ_ONLY' ? 'Terhubung Live' : 'Mode Simulasi Mock'}
          </p>
          <div className="flex items-center justify-between text-xs text-slate-400 mt-3 pt-3 border-t border-slate-800/80">
            <span className="text-[10px] text-slate-400 truncate max-w-[130px]" title={simrsStatus?.host}>
              {simrsStatus?.host || 'backend env'}
            </span>
            <span className="text-amber-400 text-[11px] font-mono">
              {simrsStatus?.writeEnabled ? 'WRITE-ON' : 'READ-ONLY'}
            </span>
          </div>
        </div>
      </div>

      {/* Main Grid: Active Mission & SIMRS Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Active Mission Banner / Telemetry (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center justify-between">
              <span>Status Pergerakan Robot Real-Time</span>
              <span className="text-[11px] font-mono text-sky-400">Pose: ({telemetry.pose.x.toFixed(2)}m, {telemetry.pose.y.toFixed(2)}m)</span>
            </h3>

            {telemetry.status === 'NAVIGATING' ? (
              <div className="bg-sky-950/40 border border-sky-800/80 rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs text-sky-300 font-semibold flex items-center gap-2">
                      <Navigation size={16} className="text-sky-400 animate-spin" /> Sedang Menjalankan Misi Navigasi
                    </span>
                    <p className="text-xs text-slate-400 mt-1 font-mono">ID Misi: {telemetry.activeMissionId}</p>
                  </div>
                  <span className="text-xs font-mono font-bold text-sky-300 bg-sky-900/60 px-2.5 py-1 rounded-lg">
                    Kecepatan: {telemetry.speed} m/s
                  </span>
                </div>

                <div className="pt-2">
                  <Link
                    href="/monitoring"
                    className="text-xs text-sky-400 hover:text-sky-300 font-semibold flex items-center gap-1.5"
                  >
                    Buka Kanvas Monitoring Live <ArrowRight size={14} />
                  </Link>
                </div>
              </div>
            ) : (
              <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-6 text-center text-slate-400 space-y-2">
                <CheckCircle2 size={32} className="mx-auto text-emerald-400/80" />
                <p className="text-sm font-semibold text-slate-200">Robot Siap Menerima Misi Baru</p>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Pilih ruangan atau titik waypoint pada menu Kendali Navigasi untuk mengirimkan misi pengantaran obat.
                </p>
              </div>
            )}
          </div>

          {/* Recent Mission History */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Clock size={16} className="text-sky-400" />
                Riwayat Aktivitas Misi Terakhir
              </h3>
              <Link href="/missions" className="text-xs text-sky-400 hover:text-sky-300 font-medium">
                Lihat Semua
              </Link>
            </div>

            <div className="space-y-2.5 text-xs">
              {recentMissions.length === 0 ? (
                <p className="text-slate-500 italic py-3 text-center">Belum ada riwayat misi.</p>
              ) : (
                recentMissions.map((m) => (
                  <div
                    key={m.id}
                    className="p-3 bg-slate-900/40 border border-slate-800 rounded-xl flex items-center justify-between"
                  >
                    <div>
                      <div className="font-semibold text-slate-200 flex items-center gap-2">
                        <span>{m.waypointName || m.roomCode || 'Waypoint'}</span>
                        {m.requestCode && (
                          <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-mono">
                            {m.requestCode}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        {new Date(m.createdAt).toLocaleTimeString('id-ID')} · oleh {m.createdBy}
                      </p>
                    </div>

                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                        m.status === 'SUCCEEDED'
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                          : m.status === 'EXECUTING'
                          ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30 animate-pulse'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {m.status}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* SIMRS Deliveries & Infectious Alerts (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Database size={16} className="text-amber-400" />
                Antrean Tugas Pengantaran Obat (SIMRS)
              </h3>
              <Link href="/simrs" className="text-xs text-amber-400 hover:text-amber-300 font-medium">
                Kelola
              </Link>
            </div>

            <div className="space-y-3 text-xs">
              {deliveries.length === 0 ? (
                <p className="text-slate-500 italic py-4 text-center">Tidak ada antrean pengantaran aktif.</p>
              ) : (
                deliveries.map((del) => (
                  <div
                    key={del.requestCode}
                    className="p-3.5 bg-slate-900/60 border border-slate-800 rounded-xl space-y-2 hover:border-slate-700 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-200">{del.roomName || del.roomCode}</span>
                      <span className="text-[10px] font-mono bg-slate-800 text-slate-300 px-2 py-0.5 rounded">
                        {del.requestCode}
                      </span>
                    </div>

                    <p className="text-slate-400 text-[11px]">
                      Pasien: <strong className="text-slate-300">{del.patientName}</strong> ({del.mrn})
                    </p>
                    <p className="text-slate-500 text-[11px] truncate">Obat: {del.medicine}</p>

                    {/* Infection Warning Alert */}
                    {del.isInfectious && (
                      <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px] p-2 rounded-lg flex items-center gap-1.5 font-medium">
                        <ShieldAlert size={14} className="text-rose-400 shrink-0" />
                        <span>Pasien Penyakit Menular / Isolasi (Protokol APD)</span>
                      </div>
                    )}

                    <div className="pt-1 flex items-center justify-between">
                      <span className="text-[10px] font-mono bg-sky-500/15 text-sky-300 px-2 py-0.5 rounded font-semibold">
                        {del.status}
                      </span>
                      <Link
                        href={`/control?room=${del.roomCode}&req=${del.requestCode}`}
                        className="text-[11px] bg-slate-800 hover:bg-slate-700 text-sky-400 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1"
                      >
                        Tugaskan Robot <ArrowRight size={12} />
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
