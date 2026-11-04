/**
 * SSE relay: GET /api/ws/stream?channels=ward:A,robot:NEVO-01   (default: all).
 * Koneksi WS ke gateway dipegang oleh lib/ws-relay (resetable saat setConnection).
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { wsAuthToken } from '../../../lib/ws-config.server';
import { getSession } from '../../../lib/ws-session';
import { addSubscriber, removeSubscriber, ensureRelay, rosterSnapshot, type Channel } from '../../../lib/ws-relay';

// ---- channel parsing (mirror medical-ws/src/core/channels.js) ----
function parseChannel(raw: string): Channel | null {
  if (raw === 'all') return { kind: 'all' };
  let m = raw.match(/^ward:([A-Za-z0-9_-]+)$/); if (m) return { kind: 'ward', code: m[1] };
  m = raw.match(/^delivery:([A-Za-z0-9:_-]+)$/); if (m) return { kind: 'delivery', code: m[1] };
  m = raw.match(/^robot:([A-Za-z0-9_-]+)$/); if (m) return { kind: 'robot', code: m[1] };
  return null;
}

export async function GET(req: NextRequest) {
  if (!wsAuthToken()) {
    return NextResponse.json({ error: 'WS_AUTH_TOKEN_NOT_SET' }, { status: 500 });
  }
  if (!getSession().identity?.uiId) {
    return NextResponse.json({ error: 'UI_ID_NOT_SET' }, { status: 409 });
  }
  if (getSession().conn.on !== true) {
    return NextResponse.json({ error: 'SESSION_OFF' }, { status: 409 });
  }

  const channels: Channel[] = [];
  for (const raw of (req.nextUrl.searchParams.get('channels') || 'all').split(',')) {
    const ch = parseChannel(raw.trim());
    if (ch) channels.push(ch);
  }
  if (!channels.length) {
    return NextResponse.json({ error: 'NO_VALID_CHANNEL' }, { status: 400 });
  }

  ensureRelay();

  const sseId = crypto.randomUUID();
  let pingTimer: NodeJS.Timeout;
  const stream = new ReadableStream({
    start(controller) {
      const send = (s: string) => controller.enqueue(new TextEncoder().encode(`data: ${s}\n\n`));
      addSubscriber(sseId, channels, send);
      send(JSON.stringify({ type: 'SSE_INIT', sseId, channels: channels.map((c) => c.kind === 'all' ? 'all' : `${c.kind}:${c.code}`) }));
      // Burst awal: roster cache (READY/POSITION/BATTERY terakhir) agar UI
      // tidak menunggu uplink robot berikutnya.
      send(JSON.stringify({ type: 'SSE_ROSTER', robots: rosterSnapshot() }));
      pingTimer = setInterval(() => send(': ping'), 15000);
      req.signal.addEventListener('abort', () => {
        clearInterval(pingTimer);
        removeSubscriber(sseId);
        try { controller.close(); } catch { /* sudah close */ }
      });
    },
    cancel() {
      clearInterval(pingTimer);
      removeSubscriber(sseId);
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