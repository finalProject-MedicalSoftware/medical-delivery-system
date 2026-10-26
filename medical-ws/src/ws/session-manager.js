/**
 * Session Manager: satu record per socket.
 * channels: Set<string> berisi channel KEY valid (`all`, `ward:A`, `delivery:DELIV-...`).
 */

class SessionManager {
  constructor() {
    this.sessions = new Map(); // socket -> { authedAt, channels:Set, isAlive }
  }

  attach(socket, meta = {}) {
    this.sessions.set(socket, {
      authedAt: meta.authedAt || Date.now(),
      channels: new Set(),
      isAlive: true
    });
  }

  detach(socket) {
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
