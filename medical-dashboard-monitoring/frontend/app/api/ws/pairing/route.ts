/**
 * Pairing tablet HMI lewat BFF (kontrak docs/api-contracts/robot-ws-tifa.md §3a). Khusus ADMIN.
 *   GET    /api/ws/pairing            → daftar tablet terpasang
 *   POST   /api/ws/pairing {ui_id}    → kode 6 digit (berlaku PAIRING_TTL_SEC di gateway)
 *   DELETE /api/ws/pairing?ui_id=...  → cabut tablet
 * Secret internal gateway (WS_INTERNAL_SECRET = INTERNAL_PUBLISH_SECRET gateway) hanya di server; browser tidak pernah melihatnya.
 */
import { NextRequest, NextResponse } from 'next/server';
import { simrsUrl, wsBackendUrl } from '../../../lib/ws-config.server';

type Profile = { username: string; role: string };
const UI_ID_RE = /^[A-Za-z0-9._-]{1,64}$/;

async function admin(req: NextRequest): Promise<Profile | null> {
  const cookie = req.headers.get('cookie');
  if (!cookie) return null;
  try {
    const r = await fetch(`${simrsUrl()}/api/v1/auth/me`, { headers: { cookie }, cache: 'no-store' });
    if (!r.ok) return null;
    const p = await r.json() as Profile;
    return p.role?.toUpperCase() === 'ADMIN' ? p : null;
  } catch { return null; }
}

/** ws(s)://host:port/path → http(s)://host:port (endpoint internal ada di server yang sama). */
function gatewayHttp(): string {
  const u = new URL(wsBackendUrl());
  return `${u.protocol === 'wss:' ? 'https:' : 'http:'}//${u.host}`;
}

async function gateway(method: string, path: string, body?: unknown) {
  const secret = process.env.WS_INTERNAL_SECRET || '';
  if (!secret) return NextResponse.json({ error: 'WS_INTERNAL_SECRET_NOT_SET' }, { status: 500 });
  try {
    const r = await fetch(`${gatewayHttp()}${path}`, {
      method, cache: 'no-store',
      headers: { 'content-type': 'application/json', 'x-internal-secret': secret },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    const data = await r.json().catch(() => ({}));
    return NextResponse.json(data, { status: r.status, headers: { 'cache-control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'GATEWAY_UNREACHABLE' }, { status: 502 });
  }
}

const forbidden = () => NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });

export async function GET(req: NextRequest) {
  if (!await admin(req)) return forbidden();
  return gateway('GET', '/internal/pairing');
}

export async function POST(req: NextRequest) {
  if (!await admin(req)) return forbidden();
  const body = await req.json().catch(() => ({}));
  const uiId = typeof body?.ui_id === 'string' ? body.ui_id.trim() : '';
  if (!UI_ID_RE.test(uiId)) return NextResponse.json({ error: 'INVALID_UI_ID' }, { status: 400 });
  return gateway('POST', '/internal/pairing', { ui_id: uiId });
}

export async function DELETE(req: NextRequest) {
  if (!await admin(req)) return forbidden();
  const uiId = req.nextUrl.searchParams.get('ui_id') ?? '';
  if (!UI_ID_RE.test(uiId)) return NextResponse.json({ error: 'INVALID_UI_ID' }, { status: 400 });
  return gateway('DELETE', `/internal/pairing/${encodeURIComponent(uiId)}`);
}
