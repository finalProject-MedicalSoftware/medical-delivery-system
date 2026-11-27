'use client';

/**
 * Pasangkan tablet HMI (kontrak robot-ws-tifa.md §3a): admin membuat kode 6 digit, perawat mengetiknya di tablet
 * (Mode Perawat → Pengaturan → Koneksi). Kode berlaku singkat & sekali pakai; daftar tablet terpasang bisa dicabut.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, RefreshCw, Trash2, Tablet } from 'lucide-react';

type Device = { ui_id: string; instance_id: string; paired_at: string; last_seen: string; code_pending: boolean };
type Code = { ui_id: string; code: string; expires_at: string };

const ERR: Record<string, string> = {
  WS_INTERNAL_SECRET_NOT_SET: 'WS_INTERNAL_SECRET belum diisi di env dashboard (samakan dengan INTERNAL_PUBLISH_SECRET gateway).',
  GATEWAY_UNREACHABLE: 'Gateway medical-ws tidak terjangkau.',
  INVALID_UI_ID: 'UI ID hanya huruf, angka, titik, minus, garis bawah.',
  FORBIDDEN: 'Hanya administrator.',
  UNAUTHORIZED: 'Secret internal ditolak gateway.',
};

export function PairingPanel() {
  const [uiId, setUiId] = useState('');
  const [code, setCode] = useState<Code | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    const r = await fetch('/api/ws/pairing', { cache: 'no-store' });
    const d = await r.json().catch(() => ({}));
    if (r.ok) setDevices(d.devices ?? []); else setMsg(ERR[d.error] ?? d.error ?? 'Gagal memuat daftar tablet.');
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!code) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [code]);

  const create = async () => {
    setBusy(true); setMsg(null);
    const r = await fetch('/api/ws/pairing', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ui_id: uiId.trim() }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.ok) { setCode(d as Code); void load(); } else setMsg(ERR[d.error] ?? d.error ?? 'Gagal membuat kode.');
  };
  const revoke = async (id: string) => {
    if (!window.confirm(`Cabut tablet ${id}? Tablet harus dipasangkan ulang.`)) return;
    const r = await fetch(`/api/ws/pairing?ui_id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!r.ok) setMsg('Gagal mencabut tablet.');
    void load();
  };

  const left = code ? Math.max(0, Math.round((Date.parse(code.expires_at) - now) / 1000)) : 0;
  return (
    <section className="glass-panel p-6 space-y-4">
      <div className="flex items-center gap-3">
        <span className="stat-icon"><Tablet size={22} /></span>
        <div>
          <p className="text-sm font-bold txt-main">Pasangkan tablet HMI</p>
          <p className="text-xs txt-sec">Kode 6 digit, sekali pakai. Ketik di tablet: Mode Perawat → Pengaturan → Koneksi.</p>
        </div>
      </div>
      {msg && <p className="text-xs text-error" role="alert">{msg}</p>}
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1.5 text-xs txt-sec">
          <span>UI ID tablet</span>
          <input value={uiId} onChange={(e) => setUiId(e.target.value)} placeholder="mis. TFUI5" className="input-field font-mono" />
        </label>
        <button type="button" onClick={create} disabled={busy || !uiId.trim()} className="btn-primary inline-flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
          <KeyRound size={15} />{busy ? 'Membuat…' : 'Buat kode'}
        </button>
      </div>
      {code && (
        <div className="bg-elevated rounded-xl p-4 border border-border-base" aria-live="polite">
          <p className="text-xs txt-sec">Kode untuk <b className="font-mono">{code.ui_id}</b></p>
          <p className="font-mono text-4xl font-bold tracking-[0.3em] txt-main my-1">{left > 0 ? `${code.code.slice(0, 3)} ${code.code.slice(3)}` : '— —'}</p>
          <p className="text-xs txt-sec">{left > 0 ? `Berlaku ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} lagi` : 'Kedaluwarsa. Buat kode baru.'}</p>
        </div>
      )}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold txt-main">Tablet terpasang</p>
          <button type="button" onClick={() => void load()} className="btn-secondary inline-flex items-center gap-1.5 text-xs"><RefreshCw size={13} />Muat ulang</button>
        </div>
        {devices.length === 0 ? <p className="text-xs txt-sec">Belum ada tablet terpasang.</p> : (
          <ul className="space-y-2">
            {devices.map((d) => (
              <li key={d.ui_id} className="bg-elevated rounded-xl p-3 border border-border-base flex items-center justify-between gap-3 text-xs">
                <div>
                  <p className="font-mono font-bold txt-main">{d.ui_id}</p>
                  <p className="txt-sec">Instance {d.instance_id.slice(0, 8)}… · terakhir {new Date(d.last_seen).toLocaleString('id-ID')}</p>
                </div>
                <button type="button" onClick={() => void revoke(d.ui_id)} className="btn-secondary inline-flex items-center gap-1.5"><Trash2 size={13} />Cabut</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
