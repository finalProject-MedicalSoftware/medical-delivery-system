'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useApp } from '../components/AppShell';
import { useLanguage } from '../components/LanguageProvider';
import { simrsMode, SIMRS_TONE_DOT } from '../lib/simrs-mode';
import {
  Database, CheckCircle2, RefreshCw, ShieldAlert, Building,
  ArrowRight, ShieldCheck,
} from 'lucide-react';

export default function SimrsPage() {
  const { request } = useApp();
  const { dict } = useLanguage();
  const t = dict.simrs;

  const [simrsStatus, setSimrsStatus] = useState<any>(null);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadData = (manualSync = false) => {
    setLoading(true);
    setMessage(null);
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
      .catch((err) => setMessage(`${t.message}: ${err.message}`))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData(false);
    const timer = window.setInterval(() => loadData(false), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const tone = simrsMode(simrsStatus?.mode).tone;
  const modeLabel = t.modes[(simrsStatus?.mode || 'default') as keyof typeof t.modes] ?? t.modes.default;
  const liveRooms = rooms.filter((r) => r.availableInSimrs !== false).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass-panel p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold txt-main flex items-center gap-2 flex-wrap">
            <Database className="text-accent" size={24} />
            {t.title}
            <span className="status-pill status-info font-mono">[{simrsStatus?.mode || t.modes.default}]</span>
          </h2>
          <p className="text-xs txt-sec mt-1">{t.subtitle}</p>
        </div>

        <button
          onClick={() => loadData(true)}
          disabled={loading}
          className="btn-primary flex items-center gap-2"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          {loading ? t.syncing : t.syncNow}
        </button>
      </div>

      {message && (
        <div className="card-hover border border-error/40 bg-error/5 p-3.5 text-error text-xs rounded-xl flex items-start gap-2">
          <ShieldAlert size={16} className="text-error shrink-0 mt-0.5" />
          {message}
        </div>
      )}

      {/* Status cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Connection Mode */}
        <div className="glass-panel p-5 space-y-2">
          <span className="text-xs txt-sec font-medium">{t.status}</span>
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${SIMRS_TONE_DOT[tone]}`} />
            <strong className="text-base txt-main">{modeLabel}</strong>
          </div>
          <p className="text-[11px] txt-sec font-mono truncate">{t.host}: {simrsStatus?.host || t.hostMissing}</p>
          <p className="text-[11px] txt-sec">{t.source}: {simrsStatus?.source || t.notSynced} · {t.lastSync}: {simrsStatus?.lastSyncTime || '-'}</p>
        </div>

        {/* Security / Write Policy */}
        <div className="glass-panel p-5 space-y-2">
          <span className="text-xs txt-sec font-medium">{t.writePolicy}</span>
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-success" />
            <strong className="text-base text-success">{t.writeProtected}</strong>
          </div>
          <p className="text-[11px] txt-sec">
            {simrsStatus?.writeEnabled ? t.writeEnabled : t.writeDisabled}
          </p>
        </div>

        {/* Token status */}
        <div className="glass-panel p-5 space-y-2">
          <span className="text-xs txt-sec font-medium">{t.token}</span>
          <div className="flex items-center gap-2">
            <strong className="text-base txt-main font-mono">
              {simrsStatus?.tokenConfigured ? t.tokenConfigured : t.tokenMissing}
            </strong>
          </div>
          <p className="text-[11px] txt-sec">
            {simrsStatus?.tokenConfigured ? t.tokenNoteOn : t.tokenNoteOff}
          </p>
        </div>
      </div>

      {/* Active Deliveries Table */}
      <div className="glass-panel p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-base">
          <div>
            <h3 className="font-bold text-sm txt-main flex items-center gap-2">
              <CheckCircle2 size={16} className="text-accent" />
              {t.deliveries}
            </h3>
            <p className="text-xs txt-sec mt-0.5">{t.subtitle}</p>
          </div>
          <span className="text-xs font-mono status-pill status-info">
            {deliveries.length} {t.queueCount}
          </span>
        </div>

        {deliveries.length === 0 ? (
          <p className="text-sm txt-sec italic py-6 text-center">{t.deliveryEmpty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-base bg-elevated/50 txt-sec">
                  <th className="py-3 px-4">{t.reqCode}</th>
                  <th className="py-3 px-4">{t.targetRoom}</th>
                  <th className="py-3 px-4">{t.patient} ({t.mrn})</th>
                  <th className="py-3 px-4">{t.medicine}</th>
                  <th className="py-3 px-4">{t.medicalAlert}</th>
                  <th className="py-3 px-4">{t.simrsStatus}</th>
                  <th className="py-3 px-4 text-right">{dict.common.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-base/60">
                {deliveries.map((del) => (
                  <tr key={del.requestCode} className="hover:bg-elevated/40 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold txt-accent">{del.requestCode}</td>
                    <td className="py-3 px-4">
                      <span className="font-semibold txt-main">{del.roomName || del.roomCode}</span>
                      <span className="text-[10px] txt-sec block">{t.floor} {del.floor} · {del.wardCode}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="txt-main">{del.patientName}</span>
                      <span className="text-[10px] txt-sec block font-mono">{del.mrn}</span>
                    </td>
                    <td className="py-3 px-4 txt-main">{del.medicine}</td>
                    <td className="py-3 px-4">
                      {del.isInfectious ? (
                        <span className="status-pill status-danger flex items-center gap-1 w-fit text-[10px]">
                          <ShieldAlert size={12} /> {t.infectiousBadge}
                        </span>
                      ) : (
                        <span className="text-[11px] txt-sec">{t.normal}</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className="status-pill status-info font-mono text-[10px]">{del.status}</span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Link
                        href={`/missions/create?room=${encodeURIComponent(del.roomCode)}&req=${encodeURIComponent(del.requestCode)}`}
                        className="btn-primary inline-flex items-center gap-1 text-xs"
                      >
                        {t.dispatch} <ArrowRight size={13} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Hospital Room Directory */}
      <div className="glass-panel p-6 space-y-4">
        <h3 className="font-bold text-sm txt-main flex items-center gap-2">
          <Building size={16} className="text-accent" />
          {t.roomDirectory} ({liveRooms} {t.roomLive} / {rooms.length})
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
          {rooms.map((rm) => (
            <div key={rm.roomCode} className="p-3 bg-elevated/60 border border-base rounded-xl space-y-1">
              <span className="font-semibold txt-main block">{rm.name}</span>
              <p className="text-[11px] font-mono txt-sec">
                {t.roomCode}: <strong>{rm.roomCode}</strong>
              </p>
              <p className="text-[10px] txt-sec">{rm.wardName} · {t.floor} {rm.floor}</p>
              <p className={`text-[10px] ${rm.availableInSimrs === false ? 'text-error' : 'text-success'}`}>
                {rm.source} · {rm.waypointStatus || t.notMapped}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
