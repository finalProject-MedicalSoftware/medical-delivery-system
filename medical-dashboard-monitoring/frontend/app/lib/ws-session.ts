/**
 * Server-side persisted session state untuk koneksi WS (TIFA-style).
 * File: `data/settings.json` — hanya dibaca/ditulis via endpoint /api/ws/session.
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const FILE = join(process.cwd(), 'data', 'settings.json');

export interface ConnState { on: boolean; lockBy: string | null; authedAt: number; }
export interface Settings { conn: ConnState; token: { present: boolean } }

function read(): Settings {
  try { return JSON.parse(readFileSync(FILE, 'utf8')); } catch {
    return { conn: { on: false, lockBy: null, authedAt: 0 }, token: { present: !!process.env.WS_AUTH_TOKEN } };
  }
}

function write(s: Settings): void {
  writeFileSync(FILE, JSON.stringify(s, null, 2) + '\n', 'utf8');
}

export function getSession(): Settings { return read(); }

export function updateSession(fn: (s: Settings) => Settings): void { write(fn(read())); }
