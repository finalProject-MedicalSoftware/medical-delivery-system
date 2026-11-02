/**
 * SSE relay: BFF memegang SATU koneksi WS ke medical-ws (Bearer server-side),
 * lalu meneruskan envelope yang cocok ke setiap subscriber SSE per channel.
 *
 * GET /api/ws/stream?channels=ward:A,robot:NEVO-01   (default: all)
 *
 * ponytail: client WS + subscriber in-memory — 1 proses. Multi-node nanti pakai pub/sub.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import WebSocket from 'ws';
import { WS_BACKEND_URL, WS_AUTH_TOKEN } from '../../../lib/ws-config.server';
import { getSession } from '../../../lib/ws-session';

// ---- channel parsing & matching (mirror medical-ws/src/core/channels.js) ----
type Channel = { kind: 'all' | 'ward' | 'delivery' | 'robot'; code?: string };

function parseChannel(raw: string): Channel | null {
  if (raw === 'all') return { kind: 'all' };
  let m = raw.match(/^ward:([A-Za-z0-9_-]+)$/); if (m) return { kind: 'ward', code: m[1] };
  m = raw.match(/^delivery:([A-Za-z0-9:_-]+)$/); if (m) return { kind: 'delivery', code: m[1] };
  m = raw.match(/^robot:([A-Za-z0-9_-]+)$/); if (m) return { kind: 'robot', code: m[1] };
  return null;
}

function matches(env: any, channels: Channel[]): boolean {
  return channels.some((c) =>
    c.kind === 'all' ||
    (c.kind === 'ward' && env.wardCode === c.code) ||
    (c.kind === 'delivery' && env.requestCode === c.code) ||
    (c.kind === 'robot' && c.code && ['ROBOT_COMMAND', 'ROBOT_COMMAND_RESULT'].includes(env.type) && env.data?.robotId === c.code)
  );
}

// ---- satu koneksi WS per proses ----
const subs = new Map<string, { channels: Channel[]; send: (s: string) => void }>();
let ws: WebSocket | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;

function wsConnect(): void {
  if (ws || reconnectTimer || !WS_AUTH_TOKEN) return;
  const socket = new WebSocket(WS_BACKEND_URL, { headers: { Authorization: `Bearer ${WS_AUTH_TOKEN}` } });
  ws = socket;

  socket.on('open', () => {
    if (ws !== socket) return; // koneksi basi — sudah di-disconnect saat setengah jalan.
    console.log('[BFF/relay] connected:', WS_BACKEND_URL);
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
    reconnectTimer = setTimeout(() => { reconnectTimer = null; wsConnect(); }, 3000);
  });

  socket.on('error', (err) => console.error('[BFF/relay] error:', err.message));
}

function wsDisconnect(): void {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (ws) { ws.close(); ws = null; }
}

export async function GET(req: NextRequest) {
  if (!WS_AUTH_TOKEN) {
    return NextResponse.json({ error: 'WS_AUTH_TOKEN_NOT_SET' }, { status: 500 });
  }
  if (getSession().conn.on !== true) {
    return NextResponse.json({ error: 'SESSION_OFF' }, { status: 409 });
  }

  // Parse channel dari query: channels=all | ward:A,robot:NEVO-01
  const channels: Channel[] = [];
  for (const raw of (req.nextUrl.searchParams.get('channels') || 'all').split(',')) {
    const ch = parseChannel(raw.trim());
    if (ch) channels.push(ch);
  }
  if (!channels.length) {
    return NextResponse.json({ error: 'NO_VALID_CHANNEL' }, { status: 400 });
  }

  wsConnect();

  const sseId = crypto.randomUUID();
  let pingTimer: NodeJS.Timeout;
  const stream = new ReadableStream({
    start(controller) {
      const send = (s: string) => controller.enqueue(new TextEncoder().encode(`data: ${s}\n\n`));
      subs.set(sseId, { channels, send });
      send(JSON.stringify({ type: 'SSE_INIT', sseId, channels: channels.map((c) => c.kind === 'all' ? 'all' : `${c.kind}:${c.code}`) }));
      pingTimer = setInterval(() => send(': ping'), 15000);
      req.signal.addEventListener('abort', () => {
        clearInterval(pingTimer);
        subs.delete(sseId);
        if (subs.size === 0) wsDisconnect(); // tidak ada subscriber -> lepas WS.
        try { controller.close(); } catch { /* sudah close */ }
      });
    },
    cancel() {
      clearInterval(pingTimer);
      subs.delete(sseId);
      if (subs.size === 0) wsDisconnect();
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
