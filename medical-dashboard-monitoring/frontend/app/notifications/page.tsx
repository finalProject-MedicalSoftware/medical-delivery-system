'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../components/AppShell';
import { useLanguage } from '../components/LanguageProvider';
import { statusPillClass } from '../lib/mission-status';
import { Bell, Wifi, AlertTriangle, Radio } from 'lucide-react';

type EventRow = {
  key: string;
  time: string;
  status: string;
  message: string;
  missionId?: number;
  progress?: number;
};

export default function NotificationsPage() {
  const { wsConnected, missionEvents } = useApp();
  const { dict } = useLanguage();
  const t = dict.notifications;
  const tc = dict.common;

  const [rows, setRows] = useState<EventRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const seq = useRef(0);

  useEffect(() => {
    setRows(missionEvents.map((event) => ({
      key: event.eventId || `ev${++seq.current}`,
      time: event.timestamp ? new Date(event.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString(),
      status: event.status || 'INFO',
      message: event.message || '',
      missionId: event.missionId,
      progress: event.progress,
    })));
  }, [missionEvents]);

  const live = wsConnected;
  const filtered = statusFilter === 'ALL' ? rows : rows.filter((r) => r.status === statusFilter);

  const STATUSES = ['ALL', 'CREATED', 'PENDING', 'EXECUTING', 'SUCCEEDED', 'CANCELLED', 'FAILED'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass-panel p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold txt-main flex items-center gap-2">
            <Bell className="text-accent" size={24} />
            {t.title}
          </h2>
          <p className="text-xs txt-sec mt-1">{t.subtitle}</p>
        </div>
        <span
          className={`status-pill ${live ? 'status-success' : 'status-warning'} flex items-center gap-1.5`}
        >
          {live ? <Wifi size={13} className="animate-pulse" /> : <AlertTriangle size={13} />}
          {t.live} · {live ? tc.connected : tc.connecting}
        </span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => {
          const n = s === 'ALL' ? rows.length : rows.filter((r) => r.status === s).length;
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                statusFilter === s
                  ? 'bg-accent text-white'
                  : 'bg-elevated txt-sec hover:bg-accent-muted'
              }`}
            >
              {s === 'ALL' ? tc.all : s}
              <span className={`font-mono ${statusFilter === s ? 'text-white/80' : 'txt-sec'}`}>
                {n}
              </span>
            </button>
          );
        })}
      </div>

      {/* Feed */}
      {filtered.length === 0 ? (
        <div className="glass-panel p-12 text-center">
          <Radio size={32} className="mx-auto txt-sec mb-2" />
          <p className="text-sm txt-sec">{t.noEvents}</p>
        </div>
      ) : (
        <div className="glass-panel divide-y divide-border-base/60">
          {filtered.map((r) => (
            <div
              key={r.key}
              className="p-4 flex items-start gap-3 hover:bg-elevated/40 transition-colors"
            >
              <span className="text-[11px] font-mono txt-sec shrink-0 pt-0.5">{r.time}</span>
              <span className={`status-pill ${statusPillClass(r.status)} shrink-0`}>
                {r.status}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs txt-main">{r.message}</p>
                {r.missionId != null && (
                  <p className="text-[10px] font-mono txt-sec mt-0.5">
                    mission #{r.missionId}
                    {r.progress != null ? ` · ${r.progress}%` : ''}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
