/** GET/POST /api/ws/session — authenticated relay-session control (TIFA-style, runtime-configurable). */
import { NextRequest, NextResponse } from 'next/server';
import { getSession, updateSession } from '../../../lib/ws-session';
import { simrsUrl, wsAuthToken, wsBackendPath, wsBackendUrl } from '../../../lib/ws-config.server';
import { relayUiId, resetRelay, ensureRelay } from '../../../lib/ws-relay';

type Profile = { username: string; role: string };

async function currentUser(req: NextRequest): Promise<Profile | null> {
  const cookie = req.headers.get('cookie');
  if (!cookie) return null;
  try {
    const response = await fetch(`${simrsUrl()}/api/v1/auth/me`, {
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

/** UI ID otomatis ala TIFA: turunan username login (unik per user). Set-nya ke-cache di server (data/settings.json). */
function defaultUiId(username: string): string {
  const slug = username.replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 24);
  return `dashboard-${slug || 'user'}`;
}

function view() {
  const s = getSession();
  const token = wsAuthToken();
  return {
    conn: s.conn,
    tokenPresent: !!token,
    tokenPrefix: token ? token.slice(0, 4) + '••••' : null,
    wsTarget: wsBackendPath(),
    relayPath: '/api/ws/stream',
    endpoints: s.endpoints ?? { simrsUrl: simrsUrl(), wsUrl: wsBackendUrl() },
    identity: s.identity ?? null,
    uiIdRelay: relayUiId(),
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
    updateSession((cur) => ({
      ...cur,
      // UI ID belum diisi → pakai turunan login (setIdentity manual masih override).
      identity: cur.identity?.uiId ? cur.identity : { ...cur.identity, uiId: defaultUiId(user.username) },
      conn: { on: true, lockBy: cur.conn.lockBy, authedAt: Date.now() },
    }));
    ensureRelay(); // mulai alur roster/downlink walau belum ada subscriber SSE (GET /api/ws/command).
    return NextResponse.json({ ok: true, ...view() });
  }

  if (action === 'turnOff') {
    updateSession((cur) => ({ ...cur, conn: { on: false, lockBy: cur.conn.lockBy, authedAt: 0 } }));
    resetRelay(); // socket ikut lepas saat OFF — tidak ada registrasi menggantung.
    return NextResponse.json({ ok: true, ...view() });
  }

  if (action === 'setConnection') {
    const ep = body?.endpoints || {};
    const simrs = typeof ep.simrsUrl === 'string' ? ep.simrsUrl.trim() : '';
    const wsUrl = typeof ep.wsUrl === 'string' ? ep.wsUrl.trim() : '';
    if (!simrs || !validHttp(simrs)) return NextResponse.json({ error: 'BAD_SIMRS_URL' }, { status: 400 });
    if (!wsUrl || !validWs(wsUrl)) return NextResponse.json({ error: 'BAD_WS_URL' }, { status: 400 });
    const wsToken = typeof body?.wsToken === 'string' ? body.wsToken.trim() : '';
    // Probe: URL wajib menjawab route auth backend (AuthApi @RequestMapping /api/v1/auth).
    // Menolak web SIMRS/host lain (404 di auth/csrf) agar URL salah tidak me-brick login.
    try {
      const probe = await fetch(`${simrs}/api/v1/auth/csrf`, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
      if (probe.status === 404) {
        return NextResponse.json({
          error: 'NOT_THE_BACKEND',
          detail: `${simrs}/api/v1/auth/csrf not found — host is not the medical backend (login needs /api/v1/auth/* there)`,
        }, { status: 400 });
      }
    } catch {
      return NextResponse.json({
        error: 'SIMRS_UNREACHABLE',
        detail: `${simrs} did not respond within 5s — check host/port and that the backend is running`,
      }, { status: 400 });
    }
    updateSession((cur) => ({ ...cur, endpoints: { simrsUrl: simrs, wsUrl }, wsToken }));
    // Reconnect dengan endpoint/token baru bila relay sedang hidup.
    resetRelay();
    if (getSession().conn.on) ensureRelay();
    return NextResponse.json({ ok: true, ...view() });
  }

  // Identitas SI-UI relay BFF (ui_id wajib agar SI diterima gateway).
  if (action === 'setIdentity') {
    const id = body?.identity || {};
    const uiId = typeof id.uiId === 'string' ? id.uiId.trim() : '';
    if (!uiId) return NextResponse.json({ error: 'BAD_UI_ID' }, { status: 400 });
    const robotId = typeof id.robotId === 'string' ? id.robotId.trim() : '';
    const mapId = Number.isInteger(id.mapId) ? id.mapId : undefined;
    updateSession((cur) => ({
      ...cur,
      identity: { uiId, ...(robotId ? { robotId } : {}), ...(mapId !== undefined ? { mapId } : {}) },
    }));
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
