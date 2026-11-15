'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { BedDouble, CheckCircle2, Loader2, MapPin, Package, Search, Send, Trash2, UserRound, XCircle } from 'lucide-react';
import { PageHeading } from '../../components/NevoUI';
import { useApp } from '../../components/AppShell';
import { useLanguage } from '../../components/LanguageProvider';
import MapViewer, { MapMetadata, WaypointItem } from '../../maps/MapViewer';

type PatientSummary = {
  id: string; mrn: string; fullName: string; roomCode: string | null; roomName: string | null;
  bedId: string | null; bedNumber: string | null; active: boolean; isInfectious: boolean; placementUpdatedAt: string;
};
type Delivery = { requestCode: string; status: string; statusLabel?: string };
type PatientDetail = PatientSummary & { activeDeliveries: Delivery[] };
type ManifestItem = PatientDetail & { waypoint: WaypointItem; compartmentNo: number; requestCode: string | null };

function NavigationContent() {
  const params = useSearchParams();
  const { request, telemetry, selectedRobotConnected, selectedRobotHasTelemetry } = useApp();
  const { language, dict } = useLanguage();
  const id = language === 'id';
  const [map, setMap] = useState<MapMetadata | null>(null);
  const [waypoints, setWaypoints] = useState<WaypointItem[]>([]);
  const [query, setQuery] = useState('');
  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<PatientDetail | null>(null);
  const [selectedWaypoint, setSelectedWaypoint] = useState<WaypointItem | null>(null);
  const [requestCode, setRequestCode] = useState('');
  const [compartment, setCompartment] = useState<number | null>(null);
  const [manifest, setManifest] = useState<ManifestItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null);

  useEffect(() => {
    request('mappings').then(async (rows: any[]) => {
      const active = rows.find((row) => row.kind === 'ROS' && row.active);
      if (!active) return;
      const [metadata, points] = await Promise.all([
        request(`maps/${active.id}/metadata`), request(`maps/${active.id}/waypoints`),
      ]);
      setMap(metadata); setWaypoints(points);
    }).catch((error) => setMessage({ tone: 'error', text: error instanceof Error ? error.message : String(error) }));
  }, [request]);

  const loadPatients = useCallback(async (cursor = '', append = false) => {
    setSearching(true);
    try {
      const response = await request(`integrations/simrs/patients?query=${encodeURIComponent(query.trim())}&limit=30${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
      const rows = Array.isArray(response?.patients) ? response.patients : [];
      setPatients((current) => append ? [...current, ...rows] : rows);
      setNextCursor(response?.nextCursor ?? null);
    } catch (error) {
      setPatients([]); setNextCursor(null);
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Data pasien SIMRS tidak tersedia.' });
    } finally { setSearching(false); }
  }, [query, request]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadPatients(), 300);
    return () => window.clearTimeout(timer);
  }, [loadPatients]);

  const selectPatient = async (patient: PatientSummary) => {
    setMessage(null); setCompartment(null); setRequestCode(''); setSelectedWaypoint(null);
    try {
      const response = await request(`integrations/simrs/patient/${encodeURIComponent(patient.mrn)}`);
      const detail: PatientDetail = { ...response.patient, activeDeliveries: response.activeDeliveries ?? [] };
      setSelected(detail);
      setRequestCode(detail.activeDeliveries[0]?.requestCode ?? '');
      setSelectedWaypoint(waypoints.find((wp) => wp.enabled && wp.room_code === detail.roomCode && wp.bed_id === detail.bedId) ?? null);
    } catch (error) {
      setSelected(null);
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : String(error) });
    }
  };

  useEffect(() => {
    const mrn = params.get('mrn');
    if (mrn && patients.length) {
      const patient = patients.find((row) => row.mrn === mrn);
      if (patient) void selectPatient(patient);
    }
  // Deep-link is applied once after the first directory response.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patients.length]);

  useEffect(() => {
    if (!selected) return;
    setSelectedWaypoint(waypoints.find((wp) => wp.enabled && wp.room_code === selected.roomCode && wp.bed_id === selected.bedId) ?? null);
  }, [selected, waypoints]);

  const compartmentCount = telemetry.compartmentCount ?? 0;
  const usedCompartments = new Set(manifest.map((item) => item.compartmentNo));
  const selectedAlreadyAdded = selected ? manifest.some((item) => item.mrn === selected.mrn) : false;
  const placementValid = Boolean(selected?.isInfectious && selected.active && selected.roomCode && selected.bedId && selected.placementUpdatedAt);
  const manifestValid = manifest.every((item) => item.isInfectious === true);

  const addToManifest = () => {
    if (!selected?.isInfectious) return setMessage({ tone: 'error', text: id ? 'Pasien tidak memiliki flag penyakit menular aktif.' : 'The patient does not have an active infectious-disease flag.' });
    if (!selected || !placementValid) return setMessage({ tone: 'error', text: id ? 'Pasien tidak memiliki placement rawat inap aktif.' : 'Patient has no active inpatient placement.' });
    if (!selectedWaypoint) return setMessage({ tone: 'error', text: id ? 'Waypoint kasur pasien belum dikonfigurasi.' : 'The patient bed waypoint has not been configured.' });
    if (compartment === null) return setMessage({ tone: 'error', text: id ? 'Pilih kompartemen.' : 'Select a compartment.' });
    if (selectedAlreadyAdded) return setMessage({ tone: 'error', text: id ? 'Pasien sudah ada di manifest.' : 'Patient is already in the manifest.' });
    if (usedCompartments.has(compartment)) return setMessage({ tone: 'error', text: id ? 'Kompartemen sudah digunakan pasien lain.' : 'Compartment is already assigned.' });
    setManifest((current) => [...current, { ...selected, waypoint: selectedWaypoint, compartmentNo: compartment, requestCode: requestCode || null }]);
    setMessage({ tone: 'success', text: id ? 'Pasien ditambahkan ke manifest.' : 'Patient added to the manifest.' });
    setSelected(null); setSelectedWaypoint(null); setCompartment(null); setRequestCode('');
  };

  const updateCompartment = (mrn: string, value: number) => {
    if (manifest.some((item) => item.mrn !== mrn && item.compartmentNo === value)) {
      setMessage({ tone: 'error', text: id ? 'Kompartemen sudah digunakan pasien lain.' : 'Compartment is already assigned.' });
      return;
    }
    setManifest((current) => current.map((item) => item.mrn === mrn ? { ...item, compartmentNo: value } : item));
  };

  const dispatch = async () => {
    if (!manifest.length) return;
    if (telemetry.status !== 'IDLE') return setMessage({ tone: 'error', text: id ? 'Robot belum siap menerima manifest baru.' : 'Robot is not ready for a new manifest.' });
    setSubmitting(true); setMessage(null);
    try {
      const infectionChecks = await Promise.all(manifest.map(async (item) => {
        try {
          const latest = await request(`integrations/simrs/patient/${encodeURIComponent(item.mrn)}`);
          return { mrn: item.mrn, valid: latest?.patient?.isInfectious === true };
        } catch {
          return { mrn: item.mrn, valid: false };
        }
      }));
      const invalidMrns = new Set(infectionChecks.filter((check) => !check.valid).map((check) => check.mrn));
      if (invalidMrns.size) {
        setManifest((current) => current.map((item) => invalidMrns.has(item.mrn) ? { ...item, isInfectious: false } : item));
        throw new Error(id
          ? 'Status penyakit menular satu atau lebih pasien tidak aktif atau tidak dapat diverifikasi. Tinjau manifest.'
          : 'The infectious-disease status of one or more patients is inactive or cannot be verified. Review the manifest.');
      }
      const response = await request('missions/manifest', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          robotId: telemetry.robotId,
          items: manifest.map((item) => ({
            patientMrn: item.mrn, roomCode: item.roomCode, bedId: item.bedId,
            placementUpdatedAt: item.placementUpdatedAt, waypointId: item.waypoint.id,
            compartmentNo: item.compartmentNo, requestCode: item.requestCode,
          })),
        }),
      });
      setManifest([]);
      setMessage({ tone: 'success', text: `${id ? 'Manifest diterima' : 'Manifest accepted'} · ${String(response.manifestId).slice(0, 8)}…` });
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : String(error) });
    } finally { setSubmitting(false); }
  };

  const cancelActive = async () => {
    if (!telemetry.activeMissionId || !window.confirm(dict.missions.cancelConfirm)) return;
    try { await request(`missions/${telemetry.activeMissionId}/cancel`, { method: 'POST' }); }
    catch (error) { setMessage({ tone: 'error', text: error instanceof Error ? error.message : String(error) }); }
  };

  return <div className="space-y-6">
    <PageHeading title={id ? 'Kendali Navigasi' : 'Navigation Control'} description={id ? 'Susun manifest pengantaran berdasarkan placement pasien SIMRS dan waypoint kasur.' : 'Build a delivery manifest from SIMRS patient placement and bed waypoints.'} />
    {message && <div role={message.tone === 'error' ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 text-sm ${message.tone === 'error' ? 'border-error/30 bg-error/5 text-error' : message.tone === 'success' ? 'border-success/30 bg-success/5 text-success' : 'border-accent/30 bg-accent/5 text-accent'}`}>{message.text}</div>}

    <div className="grid grid-cols-1 xl:grid-cols-[minmax(320px,0.85fr)_minmax(0,1.4fr)] gap-6 items-start">
      <section className="glass-panel p-5 space-y-5" aria-labelledby="patient-form-title">
        <div><h2 id="patient-form-title" className="font-semibold txt-main">{id ? 'Pilih Pasien SIMRS' : 'Select SIMRS Patient'}</h2><p className="text-xs txt-sec mt-1">{id ? 'Cari menggunakan nama atau nomor rekam medis.' : 'Search by patient name or medical record number.'}</p></div>
        <label className="relative block"><span className="sr-only">{id ? 'Cari pasien' : 'Search patients'}</span><Search size={17} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 txt-sec" /><input className="input-field input-field-with-icon" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={id ? 'Nama pasien atau MRN' : 'Patient name or MRN'} /></label>
        <div className="max-h-56 overflow-y-auto space-y-2" aria-busy={searching}>
          {searching && !patients.length ? <div className="flex items-center gap-2 text-sm txt-sec"><Loader2 size={16} className="animate-spin" />{id ? 'Memuat pasien…' : 'Loading patients…'}</div> : patients.map((patient) => <button key={patient.id} type="button" onClick={() => void selectPatient(patient)} className={`w-full text-left rounded-xl border p-3 transition ${selected?.mrn === patient.mrn ? 'border-accent bg-accent/5' : 'border-base bg-card hover:border-accent/40'}`}>
            <span className="flex items-center gap-2 font-medium txt-main"><UserRound size={15} />{patient.fullName}</span><span className="mt-1 block text-xs txt-sec">{patient.mrn} · {patient.active ? `${patient.roomName ?? patient.roomCode} · Bed ${patient.bedNumber ?? '—'}` : (id ? 'Tidak memiliki placement aktif' : 'No active placement')}</span>
          </button>)}
          {nextCursor && <button type="button" className="btn-secondary w-full" onClick={() => void loadPatients(nextCursor, true)} disabled={searching}>{id ? 'Muat lebih banyak' : 'Load more'}</button>}
        </div>

        {selected && <div className="space-y-4 border-t border-base pt-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Info label={id ? 'Ruangan otomatis' : 'Automatic room'} value={selected.roomName ?? selected.roomCode ?? '—'} ok={Boolean(selected.roomCode)} />
            <Info label={id ? 'Kasur otomatis' : 'Automatic bed'} value={selected.bedNumber ? `Bed ${selected.bedNumber}` : '—'} ok={Boolean(selected.bedId)} />
            <Info label={id ? 'Waypoint kasur' : 'Bed waypoint'} value={selectedWaypoint?.name ?? (id ? 'Belum dikonfigurasi' : 'Not configured')} ok={Boolean(selectedWaypoint)} />
            <Info label={id ? 'Sumber misi' : 'Mission source'} value={requestCode ? 'Request SIMRS' : (id ? 'Manual SIMRS' : 'Manual SIMRS')} ok />
          </div>
          {!selectedWaypoint && <p className="rounded-lg bg-warning/10 p-3 text-xs text-warning">{id ? 'Waypoint kasur pasien belum dikonfigurasi.' : 'The patient bed waypoint has not been configured.'} <Link href="/maps" className="underline font-semibold">{id ? 'Buka Peta & Waypoint' : 'Open Maps & Waypoints'}</Link></p>}
          <div><label className="text-xs font-medium txt-sec" htmlFor="delivery-request">{id ? 'Request pengiriman' : 'Delivery request'}</label><select id="delivery-request" className="input-field mt-1" value={requestCode} onChange={(event) => setRequestCode(event.target.value)}><option value="">{id ? 'Tanpa request — misi manual' : 'No request — manual mission'}</option>{selected.activeDeliveries.map((delivery) => <option key={delivery.requestCode} value={delivery.requestCode}>{delivery.requestCode} · {delivery.statusLabel ?? delivery.status}</option>)}</select></div>
          <div><label className="text-xs font-medium txt-sec" htmlFor="compartment">{id ? 'Kompartemen' : 'Compartment'}</label><select id="compartment" className="input-field mt-1" value={compartment ?? ''} onChange={(event) => setCompartment(event.target.value === '' ? null : Number(event.target.value))}><option value="">{id ? 'Pilih kompartemen' : 'Select compartment'}</option>{Array.from({ length: compartmentCount }, (_, index) => <option key={index} value={index} disabled={usedCompartments.has(index)}>#{index + 1}{usedCompartments.has(index) ? ` · ${id ? 'digunakan' : 'in use'}` : ''}</option>)}</select></div>
          <button type="button" className="btn-primary w-full inline-flex items-center justify-center gap-2" onClick={addToManifest} disabled={!placementValid || !selectedWaypoint || compartment === null || selectedAlreadyAdded}><Package size={17} />{id ? 'Tambah ke Manifest' : 'Add to Manifest'}</button>
        </div>}
      </section>

      <section className="glass-panel overflow-hidden min-h-[420px]" aria-label={id ? 'Peta ROS aktif' : 'Active ROS map'}>
        {map ? <MapViewer meta={map} waypoints={waypoints} selectedWaypointId={selectedWaypoint?.id ?? null} onSelectWaypoint={() => {}} onPickCoordinate={() => {}} robotPose={selectedRobotHasTelemetry ? telemetry.pose : null} /> : <div className="min-h-[420px] grid place-items-center p-8 text-center txt-sec"><div><MapPin size={30} className="mx-auto mb-3" /><p>{id ? 'Peta ROS aktif belum tersedia.' : 'No active ROS map is available.'}</p></div></div>}
      </section>
    </div>

    <section className="glass-panel p-5 sm:p-6 space-y-4" aria-labelledby="manifest-title">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="manifest-title" className="font-semibold txt-main">{id ? 'Manifest Pasien' : 'Patient Manifest'}</h2><p className="text-xs txt-sec mt-1">{manifest.length} {id ? 'tujuan kasur individual' : 'individual bed destinations'}</p></div><span className={`status-pill ${selectedRobotConnected && telemetry.status === 'IDLE' ? 'status-success' : 'status-warning'}`}>{telemetry.name} · {telemetry.status}</span></div>
      {!manifest.length ? <div className="rounded-xl border border-dashed border-base p-8 text-center txt-sec"><BedDouble size={28} className="mx-auto mb-2" /><p>{id ? 'Belum ada pasien dalam manifest.' : 'No patients in the manifest yet.'}</p></div> : <div className="space-y-2">{manifest.map((item, index) => <article key={item.mrn} className={`grid grid-cols-1 md:grid-cols-[auto_minmax(0,1fr)_minmax(150px,0.3fr)_auto] gap-3 items-center rounded-xl border bg-card p-3 ${item.isInfectious ? 'border-base' : 'border-error/50 bg-error/5'}`}>
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent/10 text-sm font-bold text-accent">{index + 1}</span><div className="min-w-0"><p className="font-medium txt-main truncate">{item.fullName} <span className="font-normal txt-sec">· {item.mrn}</span></p><p className="text-xs txt-sec">{item.roomName ?? item.roomCode} · Bed {item.bedNumber} · {item.waypoint.name}</p><p className="text-[11px] mt-1 text-accent">{item.requestCode ? `SIMRS ${item.requestCode}` : (id ? 'Misi manual tanpa write-back' : 'Manual mission without write-back')}</p></div><select aria-label={`${id ? 'Kompartemen' : 'Compartment'} ${item.fullName}`} className="input-field" value={item.compartmentNo} onChange={(event) => updateCompartment(item.mrn, Number(event.target.value))}>{Array.from({ length: compartmentCount }, (_, value) => <option key={value} value={value} disabled={manifest.some((other) => other.mrn !== item.mrn && other.compartmentNo === value)}>#{value + 1}</option>)}</select><button type="button" className="p-2 text-error" aria-label={`${id ? 'Hapus' : 'Remove'} ${item.fullName}`} onClick={() => setManifest((current) => current.filter((row) => row.mrn !== item.mrn))}><Trash2 size={18} /></button>
        {!item.isInfectious && <p className="md:col-start-2 md:col-span-2 text-xs font-medium text-error">{id ? 'Tidak valid: flag penyakit menular tidak aktif atau tidak dapat diverifikasi.' : 'Invalid: infectious-disease flag is inactive or cannot be verified.'}</p>}
      </article>)}</div>}
      <div className="flex flex-col sm:flex-row justify-between gap-3 border-t border-base pt-4"><p className="text-xs txt-sec max-w-xl">{id ? 'Backend akan memeriksa ulang flag penyakit menular, placement pasien, dan waypoint peta aktif sebelum dispatch. Setiap pasien dibuat sebagai misi individual dalam satu manifest.' : 'The backend revalidates the infectious-disease flag, patient placement, and active-map waypoint before dispatch. Each patient becomes an individual mission within one manifest.'}</p><div className="flex gap-2">{telemetry.activeMissionId && <button type="button" className="btn-secondary inline-flex items-center gap-2" onClick={cancelActive}><XCircle size={17} />{id ? 'Batalkan Misi Aktif' : 'Cancel Active Mission'}</button>}<button type="button" className="btn-primary inline-flex items-center justify-center gap-2" onClick={() => void dispatch()} disabled={!manifest.length || !manifestValid || submitting || !selectedRobotConnected || telemetry.status !== 'IDLE'}>{submitting ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}{id ? 'Kirim Manifest' : 'Dispatch Manifest'}</button></div></div>
    </section>
  </div>;
}

function Info({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return <div className="rounded-xl bg-elevated p-3"><p className="text-[11px] txt-sec">{label}</p><p className="mt-1 flex items-center gap-1.5 text-xs font-semibold txt-main">{ok ? <CheckCircle2 size={13} className="text-success" /> : <XCircle size={13} className="text-error" />}{value}</p></div>;
}

export default function CreateMissionPage() {
  return <Suspense fallback={<div className="skeleton h-[520px] mt-8" />}><NavigationContent /></Suspense>;
}
