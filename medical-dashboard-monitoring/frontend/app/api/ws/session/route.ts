/** GET/POST /api/ws/session — authenticated relay-session control (TIFA-style, runtime-configurable). */
import { NextRequest, NextResponse } from 'next/server';
import { getSession, updateSession } from '../../../lib/ws-session';
import { backendUrl, wsAuthToken, wsBackendPath, wsBackendUrl } from '../../../lib/ws-config.server';
import { resetRelay, ensureRelay } from '../../../lib/ws-relay';

type Profile = { username: string; role: string };

async function currentUser(req: NextRequest): Promise<Profile | null> {
  const cookie = req.headers.get('cookie');
  if (!cookie) return null;
  try {
    const response = await fetch(`${backendUrl()}/api/v1/auth/me`, {
      headers: { cookie },
      cache: 'no-store',
    });
    return response.ok ? await response.json() as Profile : null;
  } catch {
    return null;
  }
}

function unauthorized() {
  return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
}

function forbidden() {
  return NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 });
}

function validHttp(s: string) { try { const u = new URL(s); return u.protocol === 'http:' || u.protocol === 'https:'; } catch { return false; } }
function validWs(s: string) { try { const u = new URL(s); return u.protocol === 'ws:' || u.protocol === 'wss:'; } catch { return false; } }

function view() {
  const s = getSession();
  const token = wsAuthToken();
  return {
    conn: s.conn,
    tokenPresent: !!token,
    tokenPrefix: token ? token.slice(0, 4) + '••••' : null,
    wsTarget: wsBackendPath(),
    relayPath: '/api/ws/stream',
    endpoints: s.endpoints ?? { backendUrl: backendUrl(), wsUrl: wsBackendUrl() },
  };
}

export async function GET(req: NextRequest) {
  if (!await currentUser(req)) return unauthorized();
  return NextResponse.json(view());
}

export async function POST(req: NextRequest) {
  const user = await currentUser(req);
  if (!user) return unauthorized();
  if (user.role.toUpperCase() !== 'ADMIN') return forbidden();
  const body = await req.json().catch(() => ({}));
  const action: string = body?.action;

  if (action === 'turnOn') {
    if (!wsAuthToken()) return NextResponse.json({ error: 'WS_AUTH_TOKEN_NOT_SET' }, { status: 500 });
    updateSession((cur) => ({ ...cur, conn: { on: true, lockBy: cur.conn.lockBy, authedAt: Date.now() } }));
    return NextResponse.json({ ok: true, ...view() });
  }

  if (action === 'turnOff') {
    updateSession((cur) => ({ ...cur, conn: { on: false, lockBy: cur.conn.lockBy, authedAt: 0 } }));
    return NextResponse.json({ ok: true, ...view() });
  }

  if (action === 'setConnection') {
    const ep = body?.endpoints || {};
    const backend = typeof ep.backendUrl === 'string' ? ep.backendUrl.trim() : '';
    const wsUrl = typeof ep.wsUrl === 'string' ? ep.wsUrl.trim() : '';
    if (!backend || !validHttp(backend)) return NextResponse.json({ error: 'BAD_BACKEND_URL' }, { status: 400 });
    if (!wsUrl || !validWs(wsUrl)) return NextResponse.json({ error: 'BAD_WS_URL' }, { status: 400 });
    const wsToken = typeof body?.wsToken === 'string' ? body.wsToken.trim() : '';
    updateSession((cur) => ({ ...cur, endpoints: { backendUrl: backend, wsUrl }, wsToken }));
    // Reconnect dengan endpoint/token baru bila relay sedang hidup.
    resetRelay();
    if (getSession().conn.on) ensureRelay();
    return NextResponse.json({ ok: true, ...view() });
  }

  if (action === 'lock' || action === 'unlock') {
    if (action === 'lock' && (typeof body?.user !== 'string' || !body.user)) {
      return NextResponse.json({ error: 'BAD_USER' }, { status: 400 });
    }
    updateSession((cur) => ({
      ...cur,
      conn: { ...cur.conn, lockBy: action === 'lock' ? body.user : null },
    }));
    return NextResponse.json({ ok: true, ...view() });
  }

  return NextResponse.json({ error: 'INVALID_ACTION' }, { status: 400 });
}
