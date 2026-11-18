const config = require('../config/env');
const logger = require('../utils/logger');
const { BACKEND_EVENT_CODES } = require('../core/robot-frames');

/**
 * Teruskan uplink robot yang relevan untuk status misi (GOAL_COMPLETE, ACK, ERROR, ...)
 * ke backend (POST /internal/robot-events). Best-effort: gagal hanya dicatat,
 * tidak pernah memblokir relay ke UI/Kafka.
 */
function forward(frame) {
  if (!config.BACKEND_EVENTS_URL || !config.INTERNAL_PUBLISH_SECRET) return;
  if (!frame || !BACKEND_EVENT_CODES.has(frame.code)) return;
  fetch(config.BACKEND_EVENTS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': config.INTERNAL_PUBLISH_SECRET },
    body: JSON.stringify(frame),
    signal: AbortSignal.timeout(3000),
  }).then((res) => {
    if (!res.ok) logger.warn('[BackendEvents] ditolak backend:', res.status, frame.code);
  }).catch((err) => logger.warn('[BackendEvents] gagal kirim:', frame.code, err.message));
}

module.exports = { forward };
