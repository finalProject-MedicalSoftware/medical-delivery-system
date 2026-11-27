/**
 * Session Manager: satu record per socket.
 * channels: Set<string> berisi channel KEY valid (`all`, `ward:A`, `delivery:DELIV-...`).
 * identity: null | {type:'ROBOT'|'UI', id} — sesi TIFA (terdaftar via SI).
 * Registry robots/uis: id -> socket AKTIF (readyState OPEN); deteksi duplikat SI.
 */

function isOpen(socket) {
  return socket && socket.readyState === socket.OPEN;
}

class SessionManager {
  constructor() {
    this.sessions = new Map(); // socket -> { authedAt, channels:Set, isAlive, identity }
    this.robots = new Map(); // robotId -> socket
    this.uis = new Map(); // uiId -> socket
  }

  attach(socket, meta = {}) {
    this.sessions.set(socket, {
      authedAt: meta.authedAt || Date.now(),
      channels: new Set(),
      isAlive: true,
      identity: null,
      bearer: !!meta.bearer // UI legacy dengan Bearer valid (syarat subscribe legacy)
    });
  }

  /**
   * Daftarkan identitas robot TIFA. Socket lama DEAD (readyState != OPEN)
   * dikick agar SI baru langsung sukses; lama masih ALIVE -> DUPLICATE_ROBOT_ID
   * (tanpa close paksa — robot retry sendiri).
   */
  attachRobot(socket, robotId) {
    const s = this.sessions.get(socket);
    if (!s) return { success: false, error: 'NO_SESSION' };
    if (s.identity) return { success: false, error: 'SESSION_ALREADY_IDENTIFIED' };
    const old = this.robots.get(robotId);
    if (old && old !== socket) {
      if (isOpen(old)) return { success: false, error: 'DUPLICATE_ROBOT_ID' };
      this.detach(old); // ghost session
    }
    s.identity = { type: 'ROBOT', id: robotId, authenticated: false };
    this.robots.set(robotId, socket);
    return { success: true };
  }

  /**
   * Identitas UI TIFA (BFF/dashboard/tablet HMI). Socket lama DEAD dikick.
   * Socket lama masih ALIVE (kontrak robot-ws-tifa.md §3a):
   * - instance_id sama (tablet yang sama tersambung ulang, sesi lama = hantu) -> diganti;
   * - `force` (tombol manual "Ambil alih sesi") -> diganti;
   * - selain itu -> DUPLICATE_UI_ID.
   * Socket yang diganti dikembalikan sebagai `replaced` (pemanggil menutupnya 4001).
   * @param {{instanceId?: string, auth?: 'device'|'shared', force?: boolean}} [meta]
   */
  attachUI(socket, uiId, meta = {}) {
    const s = this.sessions.get(socket);
    if (!s) return { success: false, error: 'NO_SESSION' };
    if (s.identity) return { success: false, error: 'SESSION_ALREADY_IDENTIFIED' };
    const old = this.uis.get(uiId);
    let replaced = null;
    if (old && old !== socket) {
      if (isOpen(old)) {
        const prev = this.sessions.get(old);
        const sameInstance = !!meta.instanceId && !!prev && !!prev.identity && prev.identity.instanceId === meta.instanceId;
        if (!sameInstance && !meta.force) return { success: false, error: 'DUPLICATE_UI_ID' };
        replaced = old;
      }
      this.detach(old);
    }
    s.identity = { type: 'UI', id: uiId, instanceId: meta.instanceId || null, auth: meta.auth || 'shared' };
    this.uis.set(uiId, socket);
    return { success: true, replaced };
  }

  /** Socket UI hidup untuk ui_id (atau undefined). */
  getUI(uiId) {
    const sock = this.uis.get(uiId);
    return isOpen(sock) ? sock : undefined;
  }

  getRobot(robotId) {
    const sock = this.robots.get(robotId);
    return isOpen(sock) ? sock : undefined;
  }

  /** Daftar robotId dengan sesi SI aktif (untuk GET /internal/robots). */
  listRobots() {
    return Array.from(this.robots.keys()).filter((id) => isOpen(this.robots.get(id)));
  }

  detach(socket) {
    const s = this.sessions.get(socket);
    if (s && s.identity) {
      const map = s.identity.type === 'UI' ? this.uis : this.robots;
      if (map.get(s.identity.id) === socket) map.delete(s.identity.id);
    }
    this.sessions.delete(socket);
  }

  get(socket) {
    return this.sessions.get(socket);
  }

  setChannels(socket, keys) {
    const s = this.sessions.get(socket);
    if (s) s.channels = new Set(keys);
  }

  socketMatches(socket, envelope, matchesFn) {
    const s = this.sessions.get(socket);
    if (!s) return false;
    return matchesFn(envelope, s.channels);
  }

  isAlive(socket) {
    const s = this.sessions.get(socket);
    return !!s && s.isAlive;
  }

  setAlive(socket, value) {
    const s = this.sessions.get(socket);
    if (s) s.isAlive = value;
  }
}

module.exports = new SessionManager();
