'use client';

import React, { useEffect, useState } from 'react';
import { useApp } from '../components/AppShell';
import { Settings, Shield, Server, Database, Bot, AlertTriangle, Key } from 'lucide-react';

export default function SettingsPage() {
  const { user, request } = useApp();
  const [simrs, setSimrs] = useState<any>(null);

  useEffect(() => {
    request('integrations/simrs/status').then(setSimrs).catch(() => setSimrs({ mode: 'OFFLINE', message: 'Status backend tidak tersedia.' }));
  }, [request]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="bg-white p-7 rounded-2xl border border-neutral-200 shadow-sm">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Settings className="text-sky-400" size={24} />
          Pengaturan Sistem & Konfigurasi Integrasi
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Informasi lingkungan operasional, otorisasi peran, adapter robot, dan koneksi server SIMRS
        </p>
      </div>

      <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-3">
        <h3 className="font-bold text-sm text-white flex items-center gap-2 pb-3 border-b border-slate-800">
          <Key size={17} className="text-amber-400" /> Status Integrasi SIMRS (Read-only)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div><span className="text-slate-500 block">Mode</span><strong className="text-white">{simrs?.mode || 'Memuat...'}</strong></div>
          <div><span className="text-slate-500 block">Host aman</span><strong className="text-white font-mono">{simrs?.host || 'Tidak dikonfigurasi'}</strong></div>
          <div><span className="text-slate-500 block">Sinkronisasi terakhir</span><strong className="text-white font-mono">{simrs?.lastSyncTime || 'Belum ada'}</strong></div>
        </div>
        <p className="text-[11px] text-slate-400">URL, token, flag, dan interval hanya dapat diubah melalui environment backend lalu restart Spring Boot. Token tidak ditampilkan di browser.</p>
        {simrs?.message && <p className="text-[11px] text-amber-300">{simrs.message}</p>}
      </div>

      {/* Current role */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <h3 className="font-bold text-sm text-white flex items-center gap-2 pb-3 border-b border-slate-800">
          <Shield size={17} className="text-sky-400" />
          Peran Pengguna & Hak Akses (RBAC)
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className={`p-4 rounded-xl border ${user?.role === 'operator' ? 'bg-sky-950/60 border-sky-500 text-white' : 'bg-slate-900/60 border-slate-800 text-slate-400'}`}>
            <strong className="text-sm text-white">Operator {user?.role === 'operator' ? '(aktif)' : ''}</strong>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Hak akses: Melihat dashboard, kanvas occupancy grid, memilih tujuan misi navigasi otonom, mengunggah peta,
              dan mengelola koordinat waypoint. Tidak berhak mengaktifkan versi peta web.
            </p>
          </div>

          <div className={`p-4 rounded-xl border ${user?.role === 'admin' ? 'bg-sky-950/60 border-sky-500 text-white' : 'bg-slate-900/60 border-slate-800 text-slate-400'}`}>
            <strong className="text-sm text-white">Administrator {user?.role === 'admin' ? '(aktif)' : ''}</strong>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Hak akses: Seluruh wewenang Operator ditambah hak eksklusif mengaktifkan konfigurasi peta navigasi pada
              tampilan web (Baseline PRD).
            </p>
          </div>
        </div>
      </div>

      {/* Server & Database Info */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <h3 className="font-bold text-sm text-white flex items-center gap-2 pb-3 border-b border-slate-800">
          <Server size={17} className="text-emerald-400" />
          Arsitektur Backend & Database Monitoring
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800 space-y-1">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-bold">Backend Server</span>
            <strong className="text-white font-mono text-[11px]">Java Spring Boot 3.3.6</strong>
            <p className="text-slate-400 text-[10px]">Port {process.env.NEXT_PUBLIC_BACKEND_WS_PORT || '8081'} · WebSocket /ws/robot</p>
          </div>

          <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800 space-y-1">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-bold">Database</span>
            <strong className="text-white font-mono text-[11px]">PostgreSQL 16</strong>
            <p className="text-slate-400 text-[10px]">Flyway Migrations V1, V2, V3</p>
          </div>

          <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800 space-y-1">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-bold">File Storage</span>
            <strong className="text-white font-mono text-[11px]">Non-Public Local Storage</strong>
            <p className="text-slate-400 text-[10px]">./data/uploads/{`{uuid}`}</p>
          </div>
        </div>
      </div>

      {/* Robot Hardware Integration Status */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <h3 className="font-bold text-sm text-white flex items-center gap-2 pb-3 border-b border-slate-800">
          <Bot size={17} className="text-amber-400" />
          Status Integrasi Perangkat Robot Fisik
        </h3>

        <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-2 text-xs text-amber-300">
          <div className="flex items-center gap-2 font-bold">
            <AlertTriangle size={16} />
            <span>Robot Adapter Berjalan dalam Mode Simulasi (MockRobotAdapter)</span>
          </div>
          <p className="text-[11px] leading-relaxed text-amber-300/80">
            Sesuai arahan PRD Bagian 12, interface nyata ROSBridge, topic/action Nav2, frame TF, dan verifikasi
            keselamatan fisik belum tersedia. Seluruh pengujian pergerakan navigasi, baterai, dan event saat ini
            disimulasikan oleh mesin backend secara lokal dan aman tanpa risiko pada perangkat keras.
          </p>
        </div>
      </div>
    </div>
  );
}
