'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useApp } from '../components/AppShell';
import {
  Database,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ShieldAlert,
  Building,
  ArrowRight,
  ShieldCheck,
  User,
} from 'lucide-react';

export default function SimrsPage() {
  const { request } = useApp();
  const [simrsStatus, setSimrsStatus] = useState<any>(null);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadData = (manualSync = false) => {
    setLoading(true);
    (manualSync ? request('integrations/simrs/sync', { method: 'POST' }) : request('integrations/simrs/status'))
      .then(async (status) => {
        const [dels, rmList] = await Promise.all([
          request('integrations/simrs/deliveries'),
          request('rooms'),
        ]);
        return [status, dels, rmList];
      })
      .then(([status, dels, rmList]) => {
        setSimrsStatus(status);
        setDeliveries(dels);
        setRooms(rmList);
      })
      .catch((err) => setMessage('Error: ' + err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData(false);
    const timer = window.setInterval(() => loadData(false), 30000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-6 bg-white p-7 rounded-2xl border border-neutral-200 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Database className="text-amber-400" size={24} />
            Integrasi SIMRS Dummy Publik
            <span className="text-xs bg-amber-500/15 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-mono">
              [HTTP Mock Final]
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Sinkronisasi data direktori kamar, antrean pengantaran resep, dan peringatan isolasi pasien
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => loadData(true)}
            disabled={loading}
            className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold px-4 py-2.5 rounded-xl flex items-center gap-2 transition-colors"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Sinkronisasi
          </button>
        </div>
      </div>

      {message && (
        <div className="p-3.5 bg-rose-950/80 border border-rose-800 text-rose-300 text-xs rounded-xl">
          {message}
        </div>
      )}

      {/* Connection Status Panel */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Connection Mode */}
        <div className="bg-slate-950 border border-slate-800 p-5 rounded-2xl space-y-2">
          <span className="text-xs text-slate-400 font-medium">Status Koneksi SIMRS</span>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <strong className="text-base text-white">
              {simrsStatus?.mode === 'LIVE_READ_ONLY' ? 'Live Terhubung' : (simrsStatus?.mode || 'Memuat status')}
            </strong>
          </div>
          <p className="text-[11px] text-slate-400 font-mono truncate">Host backend: {simrsStatus?.host || 'tidak dikonfigurasi'}</p>
          <p className="text-[11px] text-slate-400">Sumber: {simrsStatus?.source || 'Belum tersinkron'} · Sync: {simrsStatus?.lastSyncTime || 'Belum ada'}</p>
        </div>

        {/* Security / Write Policy */}
        <div className="bg-slate-950 border border-slate-800 p-5 rounded-2xl space-y-2">
          <span className="text-xs text-slate-400 font-medium">Kebijakan Penulisan Status</span>
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-emerald-400" />
            <strong className="text-base text-emerald-400">Read-Only Protected</strong>
          </div>
          <p className="text-[11px] text-slate-400">
            {simrsStatus?.writeEnabled ? 'Write Mutasi Aktif' : 'Mutasi status publik dinonaktifkan (Safety policy)'}
          </p>
        </div>

        {/* Token status */}
        <div className="bg-slate-950 border border-slate-800 p-5 rounded-2xl space-y-2">
          <span className="text-xs text-slate-400 font-medium">Token x-monitoring-token</span>
          <div className="flex items-center gap-2">
            <strong className="text-base text-white font-mono">
              {simrsStatus?.tokenConfigured ? 'Terkonfigurasi (Server)' : 'Belum Diatur (.env)'}
            </strong>
          </div>
          <p className="text-[11px] text-slate-400">
              {simrsStatus?.tokenConfigured
              ? 'Kredensial hanya dibaca oleh Spring Boot backend'
              : 'Tidak ada token yang dikirim ke browser'}
          </p>
        </div>
      </div>

      {/* Active Deliveries Table */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <h3 className="font-bold text-sm text-white">Antrean Pengantaran Obat (Active Deliveries)</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Daftar resep obat pasien yang siap diantarkan oleh robot NEVO ke ruangan tujuan
            </p>
          </div>
          <span className="text-xs font-mono bg-slate-900 border border-slate-800 px-3 py-1 rounded-xl text-slate-300">
            {deliveries.length} Antrean
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400">
                <th className="py-3 px-4">Request Code</th>
                <th className="py-3 px-4">Ruangan Tujuan</th>
                <th className="py-3 px-4">Pasien (MRN)</th>
                <th className="py-3 px-4">Obat / Resep</th>
                <th className="py-3 px-4">Peringatan Medis</th>
                <th className="py-3 px-4">Status SIMRS</th>
                <th className="py-3 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {deliveries.map((del) => (
                <tr key={del.requestCode} className="hover:bg-slate-900/40 transition-colors">
                  <td className="py-3 px-4 font-mono font-bold text-amber-300">{del.requestCode}</td>
                  <td className="py-3 px-4">
                    <span className="font-semibold text-white">{del.roomName || del.roomCode}</span>
                    <span className="text-[10px] text-slate-500 block">Lantai {del.floor} · {del.wardCode}</span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-slate-200">{del.patientName}</span>
                    <span className="text-[10px] text-slate-500 block font-mono">{del.mrn}</span>
                  </td>
                  <td className="py-3 px-4 text-slate-300">{del.medicine}</td>
                  <td className="py-3 px-4">
                    {del.isInfectious ? (
                      <span className="bg-rose-500/15 text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 w-fit">
                        <ShieldAlert size={12} className="text-rose-400" /> Isolasi / Infeksi
                      </span>
                    ) : (
                      <span className="text-slate-500 text-[11px]">Normal</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-[10px] font-mono bg-sky-500/15 text-sky-300 px-2 py-0.5 rounded font-bold">
                      {del.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <Link
                      href={`/control?room=${del.roomCode}&req=${del.requestCode}`}
                      className="bg-sky-600 hover:bg-sky-500 text-white px-3 py-1.5 rounded-lg font-medium transition-colors inline-flex items-center gap-1"
                    >
                      Kirim Misi <ArrowRight size={13} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Hospital Room Hierarchy Card */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <h3 className="font-bold text-sm text-white flex items-center gap-2">
          <Building size={16} className="text-sky-400" />
          Direktori Ruangan SIMRS Live ({rooms.filter((r) => r.availableInSimrs !== false).length} Live / {rooms.length} total)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
          {rooms.map((rm) => (
            <div key={rm.roomCode} className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl space-y-1">
              <span className="font-semibold text-white block">{rm.name}</span>
              <p className="text-[11px] font-mono text-slate-400">
                Kode: <strong>{rm.roomCode}</strong>
              </p>
              <p className="text-[10px] text-slate-500">
                {rm.wardName} · Lantai {rm.floor}
              </p>
              <p className={`text-[10px] ${rm.availableInSimrs === false ? 'text-rose-300' : 'text-emerald-300'}`}>
                {rm.source} · {rm.waypointStatus || 'Belum dipetakan'}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
