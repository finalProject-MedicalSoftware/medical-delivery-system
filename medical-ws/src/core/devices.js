/**
 * Pairing perangkat UI (tablet HMI) — kontrak docs/api-contracts/robot-ws-tifa.md §3a.
 *
 * - Kode pairing: 6 digit acak (crypto), sekali pakai, TTL, gugur setelah N salah.
 *   Hanya di memori (hilang saat gateway restart) dan TIDAK pernah ditulis ke log.
 * - Token perangkat: 32 byte acak (base64url). Yang disimpan hanya sha256-nya,
 *   bersama ui_id + instance_id, di file JSON (DEVICES_FILE, mode 0600).
 * - Satu ui_id = satu perangkat: pairing baru menggantikan perangkat lama.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const UI_ID_RE = /^[A-Za-z0-9._-]{1,64}$/;
const INSTANCE_RE = /^[A-Za-z0-9._-]{8,100}$/;
const CODE_RE = /^\d{6}$/;

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

/** Perbandingan waktu-konstan untuk string berpanjang sama (beda panjang = tidak cocok). */
function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

class DeviceRegistry {
  /**
   * @param {{file: string, ttlMs?: number, maxAttempts?: number, now?: () => number}} opts
   */
  constructor({ file, ttlMs = 600_000, maxAttempts = 5, now = Date.now }) {
    this.file = file;
    this.ttlMs = ttlMs;
    this.maxAttempts = maxAttempts;
    this.now = now;
    this.codes = new Map(); // uiId -> { code, expiresAt, attempts }
    this.devices = this.load(); // uiId -> { instance_id, token_sha256, paired_at, last_seen }
  }

  static validUiId(v) { return typeof v === 'string' && UI_ID_RE.test(v); }
  static validInstanceId(v) { return typeof v === 'string' && INSTANCE_RE.test(v); }

  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return new Map(Object.entries(raw && raw.devices ? raw.devices : {}));
    } catch (err) {
      if (err.code !== 'ENOENT') throw new Error(`DEVICES_FILE tidak terbaca (${this.file}): ${err.message}`);
      return new Map();
    }
  }

  /** Tulis atomik (tmp + rename) agar file tidak setengah jadi saat proses mati. */
  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, devices: Object.fromEntries(this.devices) }, null, 1), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }

  /** Buat kode baru untuk ui_id (kode lama untuk ui_id itu batal). */
  createCode(uiId) {
    if (!DeviceRegistry.validUiId(uiId)) return { ok: false, error: 'INVALID_UI_ID' };
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    const expiresAt = this.now() + this.ttlMs;
    this.codes.set(uiId, { code, expiresAt, attempts: 0 });
    return { ok: true, ui_id: uiId, code, expires_at: new Date(expiresAt).toISOString() };
  }

  /**
   * Tukar kode dengan token perangkat. Gagal apa pun -> PAIR_INVALID (alasan sengaja disamarkan).
   * @returns {{ok: true, device_token: string, paired_at: string, replaced: {instance_id: string}|null} | {ok: false, error: 'PAIR_INVALID'}}
   */
  redeem(uiId, code, instanceId) {
    const fail = { ok: false, error: 'PAIR_INVALID' };
    if (!DeviceRegistry.validUiId(uiId) || !DeviceRegistry.validInstanceId(instanceId) || typeof code !== 'string' || !CODE_RE.test(code)) return fail;
    const entry = this.codes.get(uiId);
    if (!entry) return fail;
    if (this.now() > entry.expiresAt) { this.codes.delete(uiId); return fail; }
    if (!safeEqual(entry.code, code)) {
      entry.attempts += 1;
      if (entry.attempts >= this.maxAttempts) this.codes.delete(uiId);
      return fail;
    }
    this.codes.delete(uiId); // sekali pakai
    const token = crypto.randomBytes(32).toString('base64url');
    const at = new Date(this.now()).toISOString();
    const prev = this.devices.get(uiId);
    this.devices.set(uiId, { instance_id: instanceId, token_sha256: sha256(token), paired_at: at, last_seen: at });
    this.save();
    return { ok: true, device_token: token, paired_at: at, replaced: prev ? { instance_id: prev.instance_id } : null };
  }

  /** Token perangkat cocok dengan ui_id DAN instance_id? (last_seen diperbarui di memori). */
  verify(uiId, instanceId, token) {
    const d = typeof uiId === 'string' ? this.devices.get(uiId) : undefined;
    if (!d || typeof token !== 'string' || !token || d.instance_id !== instanceId) return false;
    if (!safeEqual(d.token_sha256, sha256(token))) return false;
    d.last_seen = new Date(this.now()).toISOString();
    return true;
  }

  /** Cabut perangkat ui_id (dan kode yang belum dipakai). @returns {boolean} ada yang dicabut */
  revoke(uiId) {
    this.codes.delete(uiId);
    if (!this.devices.delete(uiId)) return false;
    this.save();
    return true;
  }

  /** Daftar perangkat terpasang untuk admin/dashboard (tanpa hash token). */
  list() {
    return Array.from(this.devices.entries()).map(([ui_id, d]) => ({
      ui_id, instance_id: d.instance_id, paired_at: d.paired_at, last_seen: d.last_seen,
      code_pending: this.codes.has(ui_id)
    }));
  }
}

module.exports = { DeviceRegistry, safeEqual };
