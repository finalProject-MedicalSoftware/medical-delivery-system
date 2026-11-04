/**
 * Server-side persisted session state untuk koneksi WS (TIFA-style).
 * File: `data/settings.json` — hanya dibaca/ditulis via endpoint /api/ws/session.
 *
 * Runtime-configurable connections (redesain 4B, FEATURE_MAP_4B.md):
 * `endpoints` (simrsUrl + wsUrl), `identity`, dan `wsToken` disimpan
 * server-side — tanpa hardcoded env; read() mem-back-compat file lama
 * (`endpoints.backendUrl` lama dibaca sebagai `simrsUrl`).
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const FILE = join(process.cwd(), 'data', 'settings.json');

export interface ConnState { on: boolean; lockBy: string | null; authedAt: number; }
export interface Endpoints { simrsUrl: string; wsUrl: string; }
/** Identitas SI-UI relay BFF (ui_id wajib; sisanya default target UI). */
export interface Identity { uiId: string; robotId?: string; mapId?: number; }
export interface Settings {
  conn: ConnState;
  token: { present: boolean };
  /** Runtime endpoints; undefined = fallback env (SIMRS_URL / WS_BACKEND_URL). */
  endpoints?: Endpoints;
  /** Identitas sesi SI-UI; undefined = relay tidak bisa connect. */
  identity?: Identity;
  /** Override token WS server-side; tidak pernah dikirim utuh ke client. */
  wsToken?: string;
}

function read(): Settings {
  try {
    const raw: any = JSON.parse(readFileSync(FILE, 'utf8'));
    const ep = raw?.endpoints;
    if (ep && typeof ep.backendUrl === 'string' && typeof ep.simrsUrl !== 'string') ep.simrsUrl = ep.backendUrl;
    if (ep) delete ep.backendUrl; // shape lama dibuang saat write-back
    return raw as Settings;
  } catch {
    return { conn: { on: false, lockBy: null, authedAt: 0 }, token: { present: !!process.env.WS_AUTH_TOKEN } };
  }
}

function write(s: Settings): void {
  writeFileSync(FILE, JSON.stringify(s, null, 2) + '\n', 'utf8');
}

export function getSession(): Settings { return read(); }

export function updateSession(fn: (s: Settings) => Settings): void { write(fn(read())); }
