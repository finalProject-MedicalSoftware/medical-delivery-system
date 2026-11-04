/**
 * Satu koneksi WS per proses (protokol TIFA): BFF membuka upgade anonim lalu
 * mendaftar sebagai SI UI `{code:'SI', data:{type:'UI', ui_id, token}}`.
 * Setelah ACK_SOFT, semua frame TIFA uplink + envelope Kafka dari UI dit-forward
 * verbatim ke subscriber SSE per channel; READY/POSITION/BATTERY juga masuk
 * roster cache (burst awal SSE + GET /api/ws/command).
 * Dipakai oleh api/ws/stream & api/ws/command; `resetRelay()` dipanggil
 * setelah setConnection/setIdentity agar koneksi baru memakai konfigurasi itu.
 *
 * ponytail: subscriber & roster in-memory — 1 proses. Multi-node nanti pakai pub/sub.
 */
import { randomBytes } from 'crypto';
import WebSocket from 'ws';
import { wsBackendUrl, wsAuthToken } from './ws-config.server';
import { getSession } from './ws-session';

// ---- channel matching (mirror medical-ws/src/core/channels.js) ----
export type Channel = { kind: 'all' | 'ward' | 'delivery' | 'robot'; code?: string };

function matches(item: any, channels: Channel[]): boolean {
  const isEnvelope = typeof item?.type === 'string'; // envelope Kafka v1 (type) vs frame TIFA (code)
  return channels.some((c) => {
    if (c.kind === 'all') return true;
    if (isEnvelope) {
      return (c.kind === 'ward' && item.wardCode === c.code) ||
        (c.kind === 'delivery' && item.requestCode === c.code) ||
        (c.kind === 'robot' && c.code && ['ROBOT_COMMAND', 'ROBOT_COMMAND_RESULT'].includes(item.type) &&
          (item.data?.robotId === c.code || item.data?.robot_id === c.code));
    }
    return c.kind === 'robot' && item.data?.robot_id === c.code; // frame TIFA uplink
  });
}

// ---- roster cache (dari uplink robot: READY/POSITION/BATTERY/ERROR) ----
export interface RosterEntry { robot_id: string; lastCode: string; lastSeen: number; status: string; position: any; battery: number | null; }

// ---- state relay di globalThis ----
// Next (dev & prod) mem-bundle tiap route terpisah → module instance ws-relay
// beda-beda. Tanpa globalThis, /ws/session & /ws/stream membuka 2 socket dengan
// ui_id sama → gateway menolak DUPLICATE_UI_ID dan relay masuk loop retry.
interface RelayState {
  ws: WebSocket | null;
  reconnectTimer: NodeJS.Timeout | null;
  registered: boolean;
  roster: Map<string, RosterEntry>;
  subs: Map<string, { channels: Channel[]; send: (s: string) => void }>;
}
const g = globalThis as unknown as { __nevoWsRelay?: RelayState };
const state: RelayState = g.__nevoWsRelay ??= { ws: null, reconnectTimer: null, registered: false, roster: new Map(), subs: new Map() };

// Suffix unik per proses untuk ui_id default (`dashboard-*`): dua instans
// dashboard (dev :3000 & :3100, atau replica) yang login akun sama tidak lagi
// bertabrakan di gateway. Set-identity manual (bukan dashboard-*) tidak disentuh.
const PROCESS_SALT = randomBytes(3).toString('hex');

/** ui_id efektif untuk registrasi SI UI (base settings + suffix proses). */
export function relayUiId(): string | null {
  const base = getSession().identity?.uiId?.trim();
  if (!base) return null;
  return base.startsWith('dashboard-') ? `${base}-${PROCESS_SALT}` : base;
}

function trackRoster(frame: any): void {
  const id = frame?.data?.robot_id;
  if (typeof id !== 'string' || !id) return;
  const e = state.roster.get(id) ?? { robot_id: id, lastCode: frame.code, lastSeen: 0, status: 'UNKNOWN', position: null, battery: null };
  e.lastCode = frame.code;
  e.lastSeen = Date.now();
  const d = frame.data || {};
  if (frame.code === 'POSITION') e.position = d;
  if (frame.code === 'BATTERY') e.battery = d.battery_percent ?? d.battery ?? null;
  if (frame.code === 'READY') e.status = d.status || 'READY';
  if (frame.code === 'ERROR') e.status = d.status || 'ERROR';
  state.roster.set(id, e);
}

export function rosterSnapshot(): RosterEntry[] {
  return [...state.roster.values()].sort((a, b) => a.robot_id.localeCompare(b.robot_id));
}

function connect(): void {
  const url = wsBackendUrl();
  const token = wsAuthToken();
  const uiId = relayUiId();
  if (state.ws || state.reconnectTimer || !token || !uiId) return;
  const socket = new WebSocket(url);
  state.ws = socket;
  state.registered = false;

  socket.on('open', () => {
    if (state.ws !== socket) return; // koneksi basi — sudah di-disconnect saat setengah jalan.
    console.log('[BFF/relay] connected:', url, 'ui_id:', uiId);
    socket.send(JSON.stringify({ code: 'SI', data: { type: 'UI', ui_id: uiId, token } }));
    state.roster.clear(); // burst baru setelah connect (posisi lama pasti stale)
  });

  socket.on('message', (raw: Buffer) => {
    let item: any;
    try { item = JSON.parse(raw.toString()); } catch { return; }
    if (item?.code === 'SNAPSHOT_REQUIRED') return; // harmless broadcast saat connect
    if (state.ws !== socket) return;
    if (item?.code === 'ACK_SOFT' && item.data?.ui_id === uiId) {
      state.registered = true;
      console.log('[BFF/relay] SI UI terdaftar:', uiId);
      return;
    }
    if (item?.code === 'ERROR' && item.data?.error === 'DUPLICATE_UI_ID') {
      console.warn('[BFF/relay] SI ditolak (DUPLICATE_UI_ID) — retry 3s');
      state.registered = false;
      socket.close(); // gateway tidak close; close handler yang memicu reconnect 3s
      return;
    }
    if (getSession().conn.on !== true) return; // relay OFF -> diamkan subscriber.
    if (item?.code) trackRoster(item);
    const text = JSON.stringify(item);
    for (const sub of state.subs.values()) {
      if (matches(item, sub.channels)) sub.send(text);
    }
  });

  socket.on('close', (code) => {
    if (state.ws !== socket) return; // close dari koneksi lama — abaikan.
    console.warn(`[BFF/relay] closed (${code}), reconnect 3s`);
    state.registered = false;
    state.ws = null;
    state.reconnectTimer = setTimeout(() => { state.reconnectTimer = null; connect(); }, 3000);
  });

  socket.on('error', (err) => console.error('[BFF/relay] error:', err.message));
}

/** Pastikan koneksi relay hidup (idempoten). */
export function ensureRelay(): void { connect(); }

/** Putus paksa (dipakai setelah setConnection/setIdentity agar konfigurasi baru gregak). */
export function resetRelay(): void {
  if (state.reconnectTimer) { clearTimeout(state.reconnectTimer); state.reconnectTimer = null; }
  if (state.ws) { state.ws.close(); state.ws = null; }
  state.registered = false;
}

/** Daftarkan subscriber SSE; hapus otomatis melepas WS saat kosong. */
export function addSubscriber(id: string, channels: Channel[], send: (s: string) => void): void {
  state.subs.set(id, { channels, send });
  connect();
}

export function removeSubscriber(id: string): void {
  state.subs.delete(id);
  if (state.subs.size === 0) resetRelay(); // tidak ada subscriber -> lepas WS.
}

/** Kirim frame downlink TIFA `{code,data}` verbatim; false bila belum SI. */
export function sendDownlink(frame: { code: string; data: Record<string, unknown> }): boolean {
  if (!state.ws || !state.registered || state.ws.readyState !== WebSocket.OPEN) return false;
  state.ws.send(JSON.stringify(frame));
  return true;
}

export function relayRegistered(): boolean { return state.registered; }
