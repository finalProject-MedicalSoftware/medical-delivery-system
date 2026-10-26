'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useApp } from '../components/AppShell';
import { useLanguage } from '../components/LanguageProvider';
import { statusPillClass, missionStatusLabel } from '../lib/mission-status';
import {
  History, Search, Filter, ChevronRight, RefreshCw, Plus,
} from 'lucide-react';

const STATUS_FILTERS = ['ALL', 'EXECUTING', 'SUCCEEDED', 'CANCELLED', 'FAILED'];

export default function MissionsPage() {
  const { request } = useApp();
  const { dict, language } = useLanguage();
  const t = dict.missions;
  const locale = language === 'id' ? 'id-ID' : 'en-US';
  const [missions, setMissions] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const loadMissions = useCallback(() => {
    setLoading(true);
    request('missions?limit=100')
      .then(setMissions)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [request]);

  useEffect(() => {
    loadMissions();
  }, [loadMissions]);

  const filteredMissions = missions.filter((m) => {
    if (statusFilter !== 'ALL' && m.status !== statusFilter) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        m.waypointName?.toLowerCase().includes(query) ||
        m.roomCode?.toLowerCase().includes(query) ||
        m.requestCode?.toLowerCase().includes(query) ||
        m.id.toLowerCase().includes(query)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass-panel p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold txt-main flex items-center gap-2">
            <History className="text-accent" size={22} />
            {t.title}
          </h2>
          <p className="text-xs txt-sec mt-1">{t.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/missions/create" className="btn-primary flex items-center gap-2 text-xs">
            <Plus size={14} /> {t.newMission}
          </Link>
          <button onClick={loadMissions} className="btn-secondary flex items-center gap-2 text-xs">
            <RefreshCw size={14} /> {dict.common.refresh}
          </button>
        </div>
      </div>

      {/* Filter & Search */}
      <div className="glass-panel p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 flex-1 max-w-md bg-input border border-base rounded-xl px-3 py-2">
          <Search size={15} className="txt-sec" />
          <input
            type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t.searchPlaceholder}
            className="bg-transparent border-none txt-main focus:outline-none w-full"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Filter size={15} className="txt-sec" />
          <span className="txt-sec">{t.filterStatus}:</span>
          {STATUS_FILTERS.map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                statusFilter === st
                  ? 'bg-accent text-white shadow-sm'
                  : 'bg-elevated txt-sec hover:txt-main border border-base'
              }`}
            >
              {st === 'ALL' ? dict.common.all : missionStatusLabel(st, dict)}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="glass-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-base bg-elevated txt-sec">
                <th className="py-3 px-4 font-semibold">ID</th>
                <th className="py-3 px-4 font-semibold">{t.remoteRoom}</th>
                <th className="py-3 px-4 font-semibold">{t.requestCode}</th>
                <th className="py-3 px-4 font-semibold">{dict.common.status}</th>
                <th className="py-3 px-4 font-semibold">{t.createdBy}</th>
                <th className="py-3 px-4 font-semibold">{t.createdAt}</th>
                <th className="py-3 px-4 text-right font-semibold">{dict.common.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-color)]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 txt-sec">{dict.common.loading}</td>
                </tr>
              ) : filteredMissions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 txt-sec italic">{t.noMissions}</td>
                </tr>
              ) : (
                filteredMissions.map((m) => (
                  <tr key={m.id} className="hover:bg-elevated/60 transition-colors">
                    <td className="py-3 px-4 font-mono text-[11px] txt-sec">{m.id.slice(0, 8)}…</td>
                    <td className="py-3 px-4">
                      <span className="font-semibold txt-main">{m.waypointName || dict.maps.waypoints}</span>
                      {m.roomCode && (
                        <span className="text-[10px] font-mono txt-sec ml-2">[{m.roomCode}]</span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono txt-accent">{m.requestCode || <span className="txt-sec">-</span>}</td>
                    <td className="py-3 px-4">
                      <span className={`status-pill ${statusPillClass(m.status)}`}>
                        {missionStatusLabel(m.status, dict)}
                      </span>
                    </td>
                    <td className="py-3 px-4 txt-sec">{m.createdBy}</td>
                    <td className="py-3 px-4 txt-sec">{new Date(m.createdAt).toLocaleString(locale)}</td>
                    <td className="py-3 px-4 text-right">
                      <Link
                        href={`/missions/${m.id}`}
                        className="btn-ghost text-xs px-3 py-1.5 rounded-lg flex items-center gap-1 ml-auto"
                      >
                        {t.viewDetail} <ChevronRight size={13} />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
