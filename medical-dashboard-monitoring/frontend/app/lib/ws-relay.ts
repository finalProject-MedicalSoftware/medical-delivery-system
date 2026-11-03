/**
 * Satu koneksi WS per proses (TIFA-style): BFF memegang Bearer server-side,
 * meneruskan envelope yang cocok ke setiap subscriber SSE per channel.
 * Dipakai oleh api/ws/stream; `resetRelay()` dipanggil setelah setConnection
 * agar koneksi (dan token) baru dipakai pada siklus reconnect berikutnya.
 *
 * ponytail: subscriber in-memory — 1 proses. Multi-node nanti pakai pub/sub.
 */
import WebSocket from 'ws';
import { wsBackendUrl, wsAuthToken } from './ws-config.server';
import { getSession } from './ws-session';

// ---- channel matching (mirror medical-ws/src/core/channels.js) ----
export type Channel = { kind: 'all' | 'ward' | 'delivery' | 'robot'; code?: string };

function matches(env: any, channels: Channel[]): boolean {
  return channels.some((c) =>
    c.kind === 'all' ||
    (c.kind === 'ward' && env.wardCode === c.code) ||
    (c.kind === 'delivery' && env.requestCode === c.code) ||
    (c.kind === 'robot' && c.code && ['ROBOT_COMMAND', 'ROBOT_COMMAND_RESULT'].includes(env.type) && env.data?.robotId === c.code)
  );
}

const subs = new Map<string, { channels: Channel[]; send: (s: string) => void }>();
let ws: WebSocket | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;

function connect(): void {
  const url = wsBackendUrl();
  const token = wsAuthToken();
  if (ws || reconnectTimer || !token) return;
  const socket = new WebSocket(url, { headers: { Authorization: `Bearer ${token}` } });
  ws = socket;

  socket.on('open', () => {
    if (ws !== socket) return; // koneksi basi — sudah di-disconnect saat setengah jalan.
    console.log('[BFF/relay] connected:', url);
    socket.send(JSON.stringify({ action: 'subscribe', channels: ['all'] }));
  });

  socket.on('message', (raw: Buffer) => {
    let env: any;
    try { env = JSON.parse(raw.toString()); } catch { return; }
    if (getSession().conn.on !== true) return; // relay OFF -> diamkan subscriber.
    const text = JSON.stringify(env);
    for (const sub of subs.values()) {
      if (matches(env, sub.channels)) sub.send(text);
    }
  });

  socket.on('close', (code) => {
    if (ws !== socket) return; // close dari koneksi lama — abaikan.
    console.warn(`[BFF/relay] closed (${code}), reconnect 3s`);
    ws = null;
    reconnectTimer = setTimeout(() => { reconnectTimer = null; connect(); }, 3000);
  });

  socket.on('error', (err) => console.error('[BFF/relay] error:', err.message));
}

/** Pastikan koneksi relay hidup (idempoten). */
export function ensureRelay(): void { connect(); }

/** Putus paksa (dipakai setelah setConnection agar konfigurasi baru gregak). */
export function resetRelay(): void {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (ws) { ws.close(); ws = null; }
}

/** Daftarkan subscriber SSE; hapus otomatis melepas WS saat kosong. */
export function addSubscriber(id: string, channels: Channel[], send: (s: string) => void): void {
  subs.set(id, { channels, send });
  connect();
}

export function removeSubscriber(id: string): void {
  subs.delete(id);
  if (subs.size === 0) resetRelay(); // tidak ada subscriber -> lepas WS.
}
