/**
 * GET  /api/ws/command — snapshot roster robot (dari cache relay).
 * POST /api/ws/command — downlink frame TIFA {code,data} versi UI ke gateway
 * (user ter-autentikasi; whitelist mirror DOWNLINK_CODES @ medical-ws router.js).
 */
import { NextRequest, NextResponse } from 'next/server';
import { simrsUrl } from '../../../lib/ws-config.server';
import { relayRegistered, rosterSnapshot, sendDownlink } from '../../../lib/ws-relay';

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
  const profile = await currentUser(req);
  if (!profile) return unauthorized();
  if (!['ADMIN', 'FARMASI', 'OPERATOR'].includes(profile.role.toUpperCase())) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const code: string = typeof body?.code === 'string' ? body.code : '';
  const data = (body?.data && typeof body.data === 'object' && !Array.isArray(body.data)) ? body.data : {};
  if (!DOWNLINK_CODES.has(code)) {
    return NextResponse.json({ error: 'CODE_NOT_ALLOWED', code }, { status: 400 });
  }
  if (typeof data.robot_id !== 'string' || !data.robot_id.trim()) {
    return NextResponse.json({ error: 'ROBOT_ID_REQUIRED' }, { status: 400 });
  }
  if (code === 'TELEOP') {
    const linear = data.linear;
    const angular = data.angular;
    if (typeof linear !== 'number' || !Number.isFinite(linear) || Math.abs(linear) > 1 ||
        typeof angular !== 'number' || !Number.isFinite(angular) || Math.abs(angular) > 2) {
      return NextResponse.json({ error: 'TELEOP_PARAMS_INVALID' }, { status: 400 });
    }
    if (!relayRegistered()) {
      return NextResponse.json({ error: 'RELAY_NOT_CONNECTED' }, { status: 503 });
    }
  }
  // Until hardware possession can be proved, only a targeted zero-velocity
  // stop attempt is permitted. Readiness must not block this safety attempt.
  if (code !== 'TELEOP' || data.linear !== 0 || data.angular !== 0) {
    return NextResponse.json({ error: 'DEVICE_AUTH_UNAVAILABLE' }, { status: 409 });
  }
  if (!rosterSnapshot().some(robot => robot.robot_id === data.robot_id)) {
    return NextResponse.json({ error: 'ROBOT_OFFLINE', outcome: 'UNKNOWN' }, { status: 409 });
  }
  // Kontrak: map_id MAP_SELECTED selalu integer (kontrak robot-ws-tifa §5).
  if (code === 'MAP_SELECTED' && !Number.isInteger(data.map_id)) {
    return NextResponse.json({ error: 'MAP_ID_MUST_BE_INTEGER' }, { status: 400 });
  }
  if (!sendDownlink({ code, data })) {
    return NextResponse.json({ error: 'RELAY_NOT_CONNECTED' }, { status: 503 });
  }
  return NextResponse.json({ accepted: true, outcome: 'QUEUED_UNCONFIRMED', robotId: data.robot_id });
}
