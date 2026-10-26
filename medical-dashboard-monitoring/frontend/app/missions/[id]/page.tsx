'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useApp } from '../../components/AppShell';
import { useLanguage } from '../../components/LanguageProvider';
import { statusPillClass, missionStatusLabel } from '../../lib/mission-status';
import { ArrowLeft, Navigation, Ban, Clock, User, MapPin, KeyRound, Bot, RefreshCw } from 'lucide-react';

export default function MissionDetailPage() {
  const params = useParams();
  const id = String(params.id);
  const { request } = useApp();
  const { dict, language } = useLanguage();
  const t = dict.missions;
  const locale = language === 'id' ? 'id-ID' : 'en-US';

  const [mission, setMission] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    request(`missions/${id}`)
      .then(setMission)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [id, request]);

  useEffect(() => {
    load();
  }, [load]);

  const cancelMission = async () => {
    if (!window.confirm(t.cancelConfirm)) return;
    setBusy(true);
    try {
      await request(`missions/${id}/cancel`, { method: 'POST' });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="p-12 text-center txt-sec text-sm">{dict.common.loading}</div>;
  }

  if (!mission) {
    return (
      <div className="space-y-4">
        <Link href="/missions" className="btn-ghost text-xs inline-flex items-center gap-1.5">
          <ArrowLeft size={14} /> {dict.common.back}
        </Link>
        <div className="glass-panel p-6 text-sm txt-main border border-base">
          <p className="text-error">{error || t.notFound}</p>
        </div>
      </div>
    );
  }

  const isActive = ['CREATED', 'PENDING', 'EXECUTING'].includes(mission.status);
  const coords = mission.targetCoordinates;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass-panel p-6 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/missions" className="btn-ghost text-xs inline-flex items-center gap-1.5">
            <ArrowLeft size={14} /> {dict.common.back}
          </Link>
          <div className="flex items-center gap-2">
            {mission.simulated && (
              <span className="status-pill status-warning font-mono">{dict.common.simulated}</span>
            )}
            <button onClick={load} className="btn-secondary text-xs flex items-center gap-1.5">
              <RefreshCw size={13} /> {dict.common.refresh}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Navigation className="text-accent" size={24} />
          <div>
            <h2 className="text-xl font-bold txt-main">{t.detail}</h2>
            <p className="text-[11px] txt-sec font-mono mt-0.5">{mission.id}</p>
          </div>
          <span className={`status-pill ${statusPillClass(mission.status)} ml-2`}>
            {missionStatusLabel(mission.status, dict)}
          </span>
        </div>
      </div>

      {error && (
        <div className="glass-panel border border-error p-4 text-sm text-error flex items-center gap-2">
          <Ban size={15} /> {error}
        </div>
      )}

      {/* Info Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="glass-panel p-4 card-hover">
          <p className="text-[10px] txt-sec uppercase tracking-widest font-medium flex items-center gap-1.5 mb-1.5">
            <MapPin size={12} /> {t.waypoint}
          </p>
          <p className="text-sm font-bold txt-main">{mission.waypointName || '-'}</p>
          {coords && (
            <p className="text-[10px] txt-sec font-mono mt-0.5">
              ({Number(coords.x).toFixed(2)}m, {Number(coords.y).toFixed(2)}m)
            </p>
          )}
        </div>

        <div className="glass-panel p-4 card-hover">
          <p className="text-[10px] txt-sec uppercase tracking-widest font-medium flex items-center gap-1.5 mb-1.5">
            <Navigation size={12} /> {t.remoteRoom}
          </p>
          <p className="text-sm font-bold txt-main font-mono">{mission.roomCode || '-'}</p>
        </div>

        <div className="glass-panel p-4 card-hover">
          <p className="text-[10px] txt-sec uppercase tracking-widest font-medium flex items-center gap-1.5 mb-1.5">
            <Bot size={12} /> {t.robot}
          </p>
          <p className="text-sm font-bold txt-main font-mono">{mission.robotId || '-'}</p>
        </div>

        <div className="glass-panel p-4 card-hover">
          <p className="text-[10px] txt-sec uppercase tracking-widest font-medium flex items-center gap-1.5 mb-1.5">
            <KeyRound size={12} /> {t.requestCode}
          </p>
          <p className="text-sm font-bold txt-accent font-mono">{mission.requestCode || '-'}</p>
        </div>

        <div className="glass-panel p-4 card-hover">
          <p className="text-[10px] txt-sec uppercase tracking-widest font-medium flex items-center gap-1.5 mb-1.5">
            <User size={12} /> {t.createdBy}
          </p>
          <p className="text-sm font-bold txt-main">{mission.createdBy || '-'}</p>
        </div>

        <div className="glass-panel p-4 card-hover">
          <p className="text-[10px] txt-sec uppercase tracking-widest font-medium flex items-center gap-1.5 mb-1.5">
            <Clock size={12} /> {t.createdAt}
          </p>
          <p className="text-sm font-bold txt-main">{new Date(mission.createdAt).toLocaleString(locale)}</p>
          <p className="text-[10px] txt-sec mt-0.5">
            {dict.common.updatedAt}: {new Date(mission.updatedAt).toLocaleString(locale)}
          </p>
        </div>
      </div>

      {/* Timeline */}
      <div className="glass-panel p-5">
        <h3 className="text-sm font-bold txt-main mb-4 flex items-center gap-2">
          <Clock size={15} className="text-accent" /> {t.timeline}
        </h3>
        <div className="space-y-3 pl-3 border-l-2 border-base text-xs">
          {mission.events?.length ? (
            mission.events.map((evt: any) => (
              <div key={evt.id} className="relative pl-4">
                <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-accent ring-4 ring-card" />
                <div className="flex items-center justify-between">
                  <span className="font-bold text-accent font-mono text-[11px]">
                    {missionStatusLabel(evt.status, dict)}
                  </span>
                  <span className="text-[10px] txt-sec">
                    {new Date(evt.happenedAt).toLocaleString(locale)}
                  </span>
                </div>
                <p className="txt-main text-[11px] mt-0.5">{evt.message}</p>
                <span className="text-[10px] txt-sec font-mono">
                  {t.eventsSource}: {evt.source}
                </span>
              </div>
            ))
          ) : (
            <p className="txt-sec italic">{dict.common.none}</p>
          )}
        </div>
      </div>

      {/* Actions */}
      {isActive && (
        <div className="flex items-center gap-3">
          <button
            onClick={cancelMission}
            disabled={busy}
            className="btn-danger text-xs flex items-center gap-2"
          >
            <Ban size={14} /> {t.cancelMission}
          </button>
        </div>
      )}
    </div>
  );
}
