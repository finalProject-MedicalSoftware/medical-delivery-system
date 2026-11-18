'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useApp } from '../components/AppShell';
import { useLanguage } from '../components/LanguageProvider';
import { PageHeading, EmptyState, StatCard } from '../components/NevoUI';
import { statusPillClass, missionStatusLabel } from '../lib/mission-status';
import {
  Activity, Battery, Clock, ArrowRight, ShieldAlert, ClipboardList, Bell, Plus, BedDouble, Play,
} from 'lucide-react';

export default function DashboardPage() {
  const { telemetry, robots, selectedRobotId, selectRobot, selectedRobotConnected, selectedRobotHasTelemetry, request, backendConnected } = useApp();
  const { dict, language } = useLanguage();
  const t = dict.dashboard;
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [recentMissions, setRecentMissions] = useState<any[]>([]);

  useEffect(() => {
    const load = () => {
      request('integrations/simrs/deliveries').then((res: any) => setDeliveries(Array.isArray(res) ? res : res?.deliveries ?? [])).catch(() => {});
      request('missions?limit=100').then((rows: any[]) => setRecentMissions(
        (Array.isArray(rows) ? rows : []).filter((mission) => !selectedRobotId || mission.robotId === selectedRobotId).slice(0, 5),
      )).catch(() => {});
    };
    load();
    const timer = window.setInterval(load, 30000);
    return () => window.clearInterval(timer);
  }, [request, selectedRobotId]);

  const greeting = (() => {
    const h = new Date().getHours();
    return h < 11 ? t.greetingMorning : h < 15 ? t.greetingAfternoon : t.greetingEvening;
  })();

  const hasRobot = backendConnected && Boolean(selectedRobotId) && robots.some((robot) => robot.robotId === selectedRobotId);
  return (
    <div className="dashboard-page space-y-6">
      <PageHeading title="Dashboard" description={t.subtitle} robot actionsPlacement="below" actions={<label className="block w-full"><span className="sr-only">{language === 'id' ? 'Robot aktif' : 'Active robot'}</span><select className="input-field" value={selectedRobotId} onChange={(event) => selectRobot(event.target.value)} disabled={!robots.length}><option value="">{language === 'id' ? 'Pilih robot' : 'Select robot'}</option>{robots.map((robot) => <option key={robot.robotId} value={robot.robotId}>{robot.model || robot.name || robot.robotId}</option>)}</select></label>} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 relative">
        <StatCard label={t.robotStatus} value={hasRobot ? telemetry.status : '—'} icon={Activity}>
          {hasRobot ? <div className="flex flex-wrap gap-2"><span>{telemetry.mode}</span><span className={`status-pill ${telemetry.simulated ? 'status-warning' : 'status-success'}`}>{telemetry.simulated ? dict.common.simulated : dict.common.real}</span></div> : dict.common.noData}
        </StatCard>
        <StatCard label={dict.header.battery} value={selectedRobotHasTelemetry ? `${telemetry.battery.toFixed(1)}%` : '—'} icon={Battery} tone="success">
          {selectedRobotHasTelemetry && <div className="battery-track"><div className={`battery-fill ${telemetry.battery <= 20 ? 'low' : ''}`} style={{ width: `${Math.min(100, telemetry.battery)}%` }} /></div>}
        </StatCard>
      </div>
      <div className="dashboard-panels">
        <section className="glass-panel dashboard-main-card p-6">
          <h2 className="section-title"><Play size={24} />{t.activeMissions}</h2>
          {selectedRobotConnected && telemetry.status === 'NAVIGATING' ? <div className="my-6 rounded-2xl bg-accent-muted p-6 space-y-4">
            <span className="status-pill status-info">{dict.missions.statusExecuting}</span>
            <p className="font-semibold">{telemetry.activeMissionId}</p>
            <p className="text-sm txt-sec">{telemetry.speed} m/s · ({telemetry.pose.x.toFixed(2)}m, {telemetry.pose.y.toFixed(2)}m)</p>
            <Link href="/tracking" className="btn-primary inline-flex gap-2 items-center">{t.openTracking}<ArrowRight size={16} /></Link>
          </div> : <EmptyState icon={ClipboardList} title={language === 'id' ? 'Belum ada misi aktif' : 'No active mission'} description={language === 'id' ? 'Mulai misi baru untuk mengirim obat.' : 'Start a new medicine delivery mission.'} action={<Link href="/missions/create" className="btn-primary inline-flex items-center gap-2"><Plus size={20} />{language === 'id' ? 'Mulai Misi' : 'Start mission'}</Link>} />}
          <Link href="/tracking" className="text-sm text-accent inline-flex gap-2 items-center">{t.openTracking}<ArrowRight size={14} /></Link>
        </section>
        <section className="glass-panel dashboard-main-card p-6">
          <div className="flex justify-between items-center gap-3 mb-6"><h2 className="section-title"><Bell size={24} />{language === 'id' ? 'Antrean Pengiriman Obat' : 'Medicine Delivery Queue'}</h2><span className="status-pill status-danger">{deliveries.length}</span></div>
          {deliveries.length === 0 ? <EmptyState icon={BedDouble} title={dict.simrs.deliveryEmpty} /> : deliveries.map(del => <article key={del.requestCode} className="delivery-card">
            <div className="flex items-center gap-3"><BedDouble size={25} className="txt-sec shrink-0" /><div className="min-w-0 flex-1"><h3 className="font-bold">{del.roomName || del.roomCode}</h3><p className="txt-sec text-sm break-all">{del.requestCode}</p></div><Link href={`/missions/create${del.patientMrn || del.patient?.mrn ? `?mrn=${encodeURIComponent(del.patientMrn || del.patient.mrn)}` : ''}`} aria-label={t.newMission + ' ' + del.requestCode} className="bg-accent text-white rounded-full p-2"><ArrowRight size={20} /></Link></div>
            <div className="text-xs txt-sec mt-3 space-y-1"><p>{t.patient}: {del.patientName ?? del.patient?.fullName ?? '—'} ({del.patientMrn ?? del.mrn ?? del.patient?.mrn ?? '—'})</p><p>{t.medicine}: {del.medicineName ?? del.medicine ?? del.prescription?.medicineName ?? '—'}</p></div>
            {(del.isInfectious ?? del.patient?.isInfectious) && <p className="mt-3 p-2 bg-error/10 text-error rounded-lg text-sm flex gap-2"><ShieldAlert size={16} />{t.infectious} — APD</p>}
            {!(del.isInfectious ?? del.patient?.isInfectious) && del.robotReason && <p className="mt-3 p-2 bg-accent/10 rounded-lg text-sm">{language === 'id' ? 'Alasan robot' : 'Robot reason'}: {del.robotReason}</p>}
            <span className="status-pill status-info inline-block mt-3">{del.status}</span>
          </article>)}
          <Link href="/simrs" className="text-sm text-accent inline-flex items-center gap-2 mt-5">{t.viewAll}<ArrowRight size={14} /></Link>
        </section>
      </div>
      <section className="glass-panel p-6">
        <div className="flex justify-between items-center mb-5"><h2 className="section-title"><Clock size={22} />{t.recentMissions}</h2><Link href="/missions" className="text-accent text-sm">{t.viewAll}</Link></div>
        {recentMissions.length === 0 ? <p className="txt-sec text-sm py-5">{t.noMissions}</p> : <div className="divide-y divide-border-base">{recentMissions.map(m => <div key={m.id} className="py-4 flex justify-between gap-4"><div><p className="font-semibold">{m.waypointName || m.roomCode || dict.maps.waypoints}</p><p className="text-xs txt-sec">{m.requestCode} · {new Date(m.createdAt).toLocaleTimeString(language === 'id' ? 'id-ID' : 'en-US')} · {m.createdBy}</p></div><span className={`status-pill self-center ${statusPillClass(m.status)}`}>{missionStatusLabel(m.status, dict)}</span></div>)}</div>}
      </section>
    </div>
  );
}
