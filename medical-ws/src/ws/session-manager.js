/**
 * Session Manager: satu record per socket.
 * channels: Set<string> berisi channel KEY valid (`all`, `ward:A`, `delivery:DELIV-...`).
 * identity: null | {type:'ROBOT', id} — sesi robot TIFA (terdaftar via SI).
 */

class SessionManager {
  constructor() {
    this.sessions = new Map(); // socket -> { authedAt, channels:Set, isAlive, identity }
    this.robots = new Map(); // robotId -> socket (deteksi duplikat SI)
  }

  attach(socket, meta = {}) {
    this.sessions.set(socket, {
      authedAt: meta.authedAt || Date.now(),
      channels: new Set(),
      isAlive: true,
      identity: null
    });
  }

  /** Daftarkan identitas robot TIFA. Gagal (DUPLICATE) jika robot_id masih punya sesi aktif. */
  attachRobot(socket, robotId) {
    const s = this.sessions.get(socket);
    if (!s) return { success: false, error: 'NO_SESSION' };
    if (this.robots.has(robotId)) {
      return { success: false, error: 'DUPLICATE', existingSession: this.robots.get(robotId) !== socket };
    }
    s.identity = { type: 'ROBOT', id: robotId };
    this.robots.set(robotId, socket);
    return { success: true };
  }

  getRobot(robotId) {
    return this.robots.get(robotId);
  }

  /** Daftar robotId dengan sesi SI aktif (untuk GET /internal/robots). */
  listRobots() {
    return Array.from(this.robots.keys());
  }

  detach(socket) {
    const s = this.sessions.get(socket);
    if (s && s.identity && this.robots.get(s.identity.id) === socket) {
      this.robots.delete(s.identity.id);
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
