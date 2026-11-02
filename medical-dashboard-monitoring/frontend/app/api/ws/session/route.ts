/** GET/POST /api/ws/session — authenticated relay-session control. */
import { NextRequest, NextResponse } from 'next/server';
import { getSession, updateSession } from '../../../lib/ws-session';
import { WS_AUTH_TOKEN, wsBackendPath } from '../../../lib/ws-config.server';

const backend = process.env.BACKEND_URL || 'http://127.0.0.1:8080';

type Profile = { username: string; role: string };

async function currentUser(req: NextRequest): Promise<Profile | null> {
  const cookie = req.headers.get('cookie');
  if (!cookie) return null;
  try {
    const response = await fetch(`${backend}/api/v1/auth/me`, {
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

function view() {
  const s = getSession();
  return {
    conn: s.conn,
    tokenPresent: !!WS_AUTH_TOKEN,
    tokenPrefix: WS_AUTH_TOKEN ? WS_AUTH_TOKEN.slice(0, 4) + '••••' : null,
    wsTarget: wsBackendPath(),
    relayPath: '/api/ws/stream',
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
    if (!WS_AUTH_TOKEN) return NextResponse.json({ error: 'WS_AUTH_TOKEN_NOT_SET' }, { status: 500 });
    updateSession((cur) => ({ ...cur, conn: { on: true, lockBy: cur.conn.lockBy, authedAt: Date.now() } }));
    return NextResponse.json({ ok: true, ...view() });
  }

  if (action === 'turnOff') {
    updateSession((cur) => ({ ...cur, conn: { on: false, lockBy: cur.conn.lockBy, authedAt: 0 } }));
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
