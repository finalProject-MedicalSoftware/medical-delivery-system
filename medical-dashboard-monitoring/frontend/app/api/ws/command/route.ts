/**
 * GET  /api/ws/command — snapshot roster robot (dari cache relay).
 * POST /api/ws/command — downlink frame TIFA {code,data} versi UI ke gateway
 * (user ter-autentikasi; whitelist mirror DOWNLINK_CODES @ medical-ws router.js).
 */
import { NextRequest, NextResponse } from 'next/server';
import { simrsUrl } from '../../../lib/ws-config.server';
import { rosterSnapshot, sendDownlink } from '../../../lib/ws-relay';

// Mirror DOWNLINK_CODES (medical-ws/src/ws/router.js).
const DOWNLINK_CODES = new Set([
  'TELEOP', 'MOVE', 'OP', 'MODE',
  'MAPPING_START', 'MAPPING_STOP', 'MAPPING_SAVE', 'MAPPING_FLAG',
  'MAP_SELECTED', 'MAP_DATA',
  'INTERRUPT', 'INTERRUPT_CONFIRM', 'INTERRUPT_CANCEL',
  'PICKUP_CONFIRM',
]);

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

export async function GET(req: NextRequest) {
  if (!await currentUser(req)) return unauthorized();
  return NextResponse.json({ robots: rosterSnapshot() });
}

export async function POST(req: NextRequest) {
  if (!await currentUser(req)) return unauthorized();
  const body = await req.json().catch(() => ({}));
  const code: string = typeof body?.code === 'string' ? body.code : '';
  const data = (body?.data && typeof body.data === 'object' && !Array.isArray(body.data)) ? body.data : {};
  if (!DOWNLINK_CODES.has(code)) {
    return NextResponse.json({ error: 'CODE_NOT_ALLOWED', code }, { status: 400 });
  }
  // Kontrak: map_id MAP_SELECTED selalu integer (kontrak robot-ws-tifa §5).
  if (code === 'MAP_SELECTED' && !Number.isInteger(data.map_id)) {
    return NextResponse.json({ error: 'MAP_ID_MUST_BE_INTEGER' }, { status: 400 });
  }
  if (!sendDownlink({ code, data })) {
    return NextResponse.json({ error: 'RELAY_NOT_CONNECTED' }, { status: 503 });
  }
  return NextResponse.json({ ok: true, code, data });
}
