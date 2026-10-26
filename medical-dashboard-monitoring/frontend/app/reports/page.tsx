'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../components/AppShell';
import { useLanguage } from '../components/LanguageProvider';
import { statusPillClass, missionStatusLabel } from '../lib/mission-status';
import { BarChart3, Download, CheckCircle2, XCircle, AlertOctagon, Clock } from 'lucide-react';

type Range = 'today' | '7d' | '30d';

const TERMINAL = new Set(['SUCCEEDED', 'CANCELLED', 'FAILED']);

export default function ReportsPage() {
  const { request } = useApp();
  const { dict, language } = useLanguage();
  const t = dict.reports;
  const tm = dict.missions;
  const locale = language === 'id' ? 'id-ID' : 'en-US';

  const [missions, setMissions] = useState<any[]>([]);
  const [range, setRange] = useState<Range>('7d');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    request('missions?limit=100')
      .then((rows) => setMissions(Array.isArray(rows) ? rows : []))
      .catch(() => setMissions([]))
      .finally(() => setLoading(false));
  }, [request]);

  const filtered = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    if (range === 'today') start.setHours(0, 0, 0, 0);
    else if (range === '7d') start.setDate(now.getDate() - 6);
    else start.setDate(now.getDate() - 29);
    start.setHours(0, 0, 0, 0);
    return missions.filter((m) => new Date(m.createdAt) >= start);
  }, [missions, range]);

  const stats = useMemo(() => {
    const count = (s: string) => filtered.filter((m) => m.status === s).length;
    const succeeded = count('SUCCEEDED');
    const cancelled = count('CANCELLED');
    const failed = count('FAILED');
    const durations = filtered
      .filter((m) => TERMINAL.has(m.status) && m.updatedAt && new Date(m.updatedAt) > new Date(m.createdAt))
      .map((m) => new Date(m.updatedAt).getTime() - new Date(m.createdAt).getTime());
    const avgMs = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
    return { total: filtered.length, succeeded, cancelled, failed, avgMs };
  }, [filtered]);

  // Per-day trend (createdAt bucket)
  const trend = useMemo(() => {
    const days: { key: string; label: string; total: number; succeeded: number }[] = [];
    const now = new Date();
    const span = range === 'today' ? 1 : range === '7d' ? 7 : 30;
    for (let i = span - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      d.setHours(0, 0, 0, 0);
      days.push({
        key: d.toISOString().slice(0, 10),
        label: d.toLocaleDateString(locale, { day: '2-digit', month: 'short' }),
        total: 0,
        succeeded: 0,
      });
    }
    const idx = new Map(days.map((d, i) => [d.key, i]));
    for (const m of filtered) {
      const key = new Date(m.createdAt).toISOString().slice(0, 10);
      const row = idx.get(key);
      if (row !== undefined) {
        days[row].total += 1;
        if (m.status === 'SUCCEEDED') days[row].succeeded += 1;
      }
    }
    return days;
  }, [filtered, range, locale]);

  const fmtDuration = (ms: number) => {
    if (!ms) return '-';
    const mins = Math.round(ms / 60000);
    if (mins < 60) return `${mins} m`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  };

  const exportCsv = () => {
    const head = ['id', 'requestCode', 'roomCode', 'createdBy', 'status', 'simulated', 'createdAt', 'updatedAt'];
    const lines = [
      head.join(','),
      ...filtered.map((m) =>
        head.map((k) => `"${String(m[k] ?? '').replaceAll('"', '""')}"`).join(','),
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `missions-${range}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const RANGE_BTN = 'px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors';

  const statCard = (
    icon: React.ReactNode,
    label: string,
    value: string | number,
    accent: string,
  ) => (
    <div className="glass-panel p-5 space-y-1.5">
      <span className="text-xs txt-sec font-medium flex items-center gap-1.5">{icon} {label}</span>
      <strong className={`text-2xl font-bold ${accent} block`}>{value}</strong>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass-panel p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold txt-main flex items-center gap-2">
            <BarChart3 className="text-accent" size={24} />
            {t.title}
          </h2>
          <p className="text-xs txt-sec mt-1">{t.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          {(['today', '7d', '30d'] as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`${RANGE_BTN} ${
                range === r
                  ? 'bg-accent text-white'
                  : 'bg-elevated txt-sec hover:bg-accent-muted'
              }`}
            >
              {r === 'today' ? t.rangeToday : r === '7d' ? t.range7d : t.range30d}
            </button>
          ))}
          <button onClick={exportCsv} className="btn-primary flex items-center gap-1.5 text-xs">
            <Download size={14} /> {t.exportCsv}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm txt-sec text-center py-10">{dict.common.loading}</p>
      ) : filtered.length === 0 ? (
        <div className="glass-panel p-10 text-center">
          <BarChart3 size={32} className="mx-auto txt-sec mb-2" />
          <p className="text-sm txt-sec">{t.empty}</p>
        </div>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {statCard(<BarChart3 size={13} />, t.total, stats.total, 'txt-main')}
            {statCard(<CheckCircle2 size={13} />, t.succeeded, stats.succeeded, 'text-success')}
            {statCard(<XCircle size={13} />, t.cancelled, stats.cancelled, 'text-warning')}
            {statCard(<AlertOctagon size={13} />, t.failed, stats.failed, 'text-error')}
            {statCard(<Clock size={13} />, t.avgDuration, fmtDuration(stats.avgMs), 'txt-accent')}
          </div>

          {/* Trend */}
          <div className="glass-panel p-6 space-y-4">
            <h3 className="font-bold text-sm txt-main">{t.trend}</h3>
            <div className="flex items-end gap-1.5 h-40">
              {trend.map((d) => {
                const max = Math.max(1, ...trend.map((x) => x.total));
                const h = Math.max(4, Math.round((d.total / max) * 100));
                const sh = d.total ? Math.round((d.succeeded / d.total) * h) : 0;
                return (
                  <div key={d.key} className="flex-1 group flex flex-col items-center justify-end gap-1">
                    <span className="text-[10px] font-mono txt-sec opacity-0 group-hover:opacity-100 transition-opacity">
                      {d.total}
                    </span>
                    <div
                      className="w-full rounded-t-md bg-accent/25 relative overflow-hidden"
                      style={{ height: `${h}%` }}
                      title={`${d.label}: ${d.total}`}
                    >
                      <div
                        className="absolute bottom-0 left-0 right-0 bg-accent"
                        style={{ height: `${sh}%` }}
                      />
                    </div>
                    {(range === 'today' || trend.length <= 7 || trend.indexOf(d) % 5 === 0) && (
                      <span className="text-[9px] txt-sec">{d.label}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Breakdown */}
          <div className="glass-panel p-6 space-y-3">
            <h3 className="font-bold text-sm txt-main">{t.byStatus}</h3>
            <div className="flex flex-wrap gap-2">
              {['CREATED', 'PENDING', 'EXECUTING', 'SUCCEEDED', 'CANCELLED', 'FAILED'].map((s) => {
                const n = filtered.filter((m) => m.status === s).length;
                if (!n) return null;
                return (
                  <span key={s} className={`status-pill ${statusPillClass(s)}`}>
                    {missionStatusLabel(s, dict)}: {n}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Table */}
          <div className="glass-panel p-6 space-y-4">
            <h3 className="font-bold text-sm txt-main">{t.table} ({filtered.length})</h3>
            <div className="overflow-x-auto max-h-[28rem] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-base txt-sec">
                    <th className="py-3 px-4">{tm.requestCode}</th>
                    <th className="py-3 px-4">{tm.remoteRoom}</th>
                    <th className="py-3 px-4">{tm.createdBy}</th>
                    <th className="py-3 px-4">{dict.common.status}</th>
                    <th className="py-3 px-4">{tm.createdAt}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-base/60">
                  {filtered.map((m) => (
                    <tr key={m.id} className="hover:bg-elevated/40 transition-colors">
                      <td className="py-3 px-4 font-mono txt-accent">{m.requestCode}</td>
                      <td className="py-3 px-4 txt-main">{m.roomCode}</td>
                      <td className="py-3 px-4 txt-sec">{m.createdBy}</td>
                      <td className="py-3 px-4">
                        <span className={`status-pill ${statusPillClass(m.status)}`}>
                          {missionStatusLabel(m.status, dict)}
                        </span>
                      </td>
                      <td className="py-3 px-4 txt-sec">
                        {new Date(m.createdAt).toLocaleString(locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
