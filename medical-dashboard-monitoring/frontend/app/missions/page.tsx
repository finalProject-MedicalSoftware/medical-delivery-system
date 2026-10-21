'use client';

import React, { useState, useEffect } from 'react';
import { useApp } from '../components/AppShell';
import {
  History,
  CheckCircle2,
  XCircle,
  Clock,
  Navigation,
  Search,
  Filter,
  Layers,
  ChevronRight,
  Info,
  Calendar,
} from 'lucide-react';

export default function MissionsPage() {
  const { request } = useApp();
  const [missions, setMissions] = useState<any[]>([]);
  const [selectedMission, setSelectedMission] = useState<any | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const loadMissions = () => {
    setLoading(true);
    request('missions?limit=100')
      .then(setMissions)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadMissions();
  }, []);

  const openMissionDetail = async (id: string) => {
    try {
      const detail = await request(`missions/${id}`);
      setSelectedMission(detail);
    } catch {
      // ignore
    }
  };

  const filteredMissions = missions.filter((m) => {
    if (statusFilter !== 'ALL' && m.status !== statusFilter) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchName = m.waypointName?.toLowerCase().includes(query);
      const matchRoom = m.roomCode?.toLowerCase().includes(query);
      const matchReq = m.requestCode?.toLowerCase().includes(query);
      const matchId = m.id.toLowerCase().includes(query);
      return matchName || matchRoom || matchReq || matchId;
    }
    return true;
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-6 bg-white p-7 rounded-2xl border border-neutral-200 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-neutral-900 flex items-center gap-2">
            <History className="text-blue-600" size={24} />
            Riwayat & Log Siklus Misi Otonom
            <span className="text-[10px] bg-amber-50 text-amber-800 border border-amber-200 px-2 py-1 rounded-full font-semibold">
              SIMULASI WEB
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Audit komprehensif lifecycle perintah navigasi dari penyerahan hingga robot tiba di tujuan
          </p>
        </div>

        <button
          onClick={loadMissions}
          className="bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs font-semibold px-4 py-2.5 rounded-xl flex items-center gap-2 transition-colors"
        >
          Muat Ulang
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 flex-1 max-w-md bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2">
          <Search size={15} className="text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari berdasarkan nama waypoint, kode ruang, atau request..."
            className="bg-transparent border-none text-xs text-slate-200 focus:outline-none w-full"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter size={15} className="text-slate-400" />
          <span className="text-slate-400">Status:</span>
          {['ALL', 'EXECUTING', 'SUCCEEDED', 'CANCELLED'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                statusFilter === st
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200'
              }`}
            >
              {st === 'ALL' ? 'Semua' : st}
            </button>
          ))}
        </div>
      </div>

      {/* Main Missions Table */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400">
                <th className="py-3 px-4">ID Misi</th>
                <th className="py-3 px-4">Tujuan / Ruangan</th>
                <th className="py-3 px-4">Request SIMRS</th>
                <th className="py-3 px-4">Status Lifecycle</th>
                <th className="py-3 px-4">Dibuat Oleh</th>
                <th className="py-3 px-4">Waktu</th>
                <th className="py-3 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-500">
                    Memuat riwayat misi...
                  </td>
                </tr>
              ) : filteredMissions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-500 italic">
                    Tidak ada misi yang cocok dengan kriteria pencarian.
                  </td>
                </tr>
              ) : (
                filteredMissions.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-900/40 transition-colors">
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-400">
                      {m.id.slice(0, 8)}...
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-semibold text-white">{m.waypointName || 'Waypoint'}</span>
                      {m.roomCode && (
                        <span className="text-[10px] font-mono text-slate-400 ml-2">[{m.roomCode}]</span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono text-amber-300">
                      {m.requestCode || <span className="text-slate-600">-</span>}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                          m.status === 'SUCCEEDED'
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                            : m.status === 'EXECUTING'
                            ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30 animate-pulse'
                            : m.status === 'CANCELLED'
                            ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {m.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-400">{m.createdBy}</td>
                    <td className="py-3 px-4 text-slate-400">
                      {new Date(m.createdAt).toLocaleString('id-ID')}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => openMissionDetail(m.id)}
                        className="bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 px-3 py-1 rounded-lg transition-colors flex items-center gap-1 ml-auto"
                      >
                        Detail Lifecycle <ChevronRight size={13} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mission Detail Modal */}
      {selectedMission && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <Navigation size={20} className="text-sky-400" />
                <div>
                  <h3 className="font-bold text-base text-white">Detail Lifecycle Misi</h3>
                  <p className="text-xs text-slate-400 font-mono">ID: {selectedMission.id}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedMission(null)}
                className="text-slate-400 hover:text-slate-200 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-950 p-4 rounded-xl border border-slate-800">
              <div>
                <span className="text-slate-400 block mb-0.5">Tujuan:</span>
                <strong className="text-white">{selectedMission.waypointName}</strong>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5">Status Akhir:</span>
                <strong className="text-emerald-400 font-mono">{selectedMission.status}</strong>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5">Kode Ruang:</span>
                <span className="font-mono text-slate-300">{selectedMission.roomCode || '-'}</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5">Request SIMRS:</span>
                <span className="font-mono text-amber-300">{selectedMission.requestCode || '-'}</span>
              </div>
            </div>

            {/* Event Timeline */}
            <div>
              <h4 className="text-xs font-bold text-white mb-3">Timeline Peristiwa Navigasi</h4>
              <div className="space-y-3 pl-3 border-l-2 border-slate-800 text-xs">
                {selectedMission.events?.map((evt: any) => (
                  <div key={evt.id} className="relative pl-3">
                    <div className="absolute -left-[19px] top-1 w-2.5 h-2.5 rounded-full bg-sky-500 ring-4 ring-slate-900" />
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sky-300 font-mono text-[11px]">{evt.status}</span>
                      <span className="text-[10px] text-slate-500">
                        {new Date(evt.happenedAt).toLocaleTimeString('id-ID')}
                      </span>
                    </div>
                    <p className="text-slate-300 text-[11px] mt-0.5">{evt.message}</p>
                    <span className="text-[10px] text-slate-500 font-mono">Sumber: {evt.source}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2 text-right">
              <button
                onClick={() => setSelectedMission(null)}
                className="bg-slate-800 hover:bg-slate-700 text-white text-xs px-4 py-2 rounded-xl transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
