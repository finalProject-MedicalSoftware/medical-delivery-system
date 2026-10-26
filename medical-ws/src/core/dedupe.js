/**
 * Dedupe eventId server-side (kontrak 2.4 poin 4: at-least-once, duplikat
 * akan terjadi; konsumen dedupe by eventId, simpan 15 menit terakhir).
 * Klien tetap wajib dedupe sendiri — lapisan ini hanya menekan fanout.
 */
class Dedupe {
  constructor(ttlMs = 15 * 60 * 1000) {
    this.map = new Map(); // eventId -> firstSeenAt
    this.ttl = ttlMs;
  }

  seen(eventId, now = Date.now()) {
    this.cleanup(now);
    if (this.map.has(eventId)) return true;
    this.map.set(eventId, now);
    return false;
  }

  cleanup(now) {
    for (const [eventId, ts] of this.map) {
      if (now - ts > this.ttl) this.map.delete(eventId);
    }
  }
}

module.exports = Dedupe;
