const logger = require('../utils/logger');
const { parseChannels } = require('../core/channels');
const sessionManager = require('./session-manager');
const kafkaProducer = require('../kafka/producer');
const { TOPICS } = require('../kafka/config');
const { generateMessageId } = require('../utils/uuid');

function send(socket, payload) {
  if (socket.readyState !== socket.OPEN) return;
  socket.send(JSON.stringify(payload));
}

function sendError(socket, code, detail) {
  send(socket, { type: 'ERROR', code, detail });
}

// ---------------------------------------------------------------------------
// Protokol robot TIFA (verbatim): frame {code,data}; SI -> ACK_SOFT; duplikat
// -> ERROR + close 4002. Uplink -> Kafka simrs.robot.events.v1 + broadcast ke
// sesi UI yang subscribe `robot:<id>` atau `all`. Downlink UI->robot via
// deliverRobotCommand (kontrak robot-command.md + robot-ws-tifa.md §5).
// ---------------------------------------------------------------------------

function handleSI(socket, data) {
  if (!data || data.type !== 'ROBOT' || typeof data.robot_id !== 'string' || !data.robot_id) {
    send(socket, { code: 'ERROR', data: { error: 'INVALID_SI', message: 'SI wajib {type:"ROBOT", robot_id:string}' } });
    setTimeout(() => socket.close(4003, 'Invalid SI'), 100);
    return;
  }
  const result = sessionManager.attachRobot(socket, data.robot_id);
  if (!result.success) {
    logger.warn(`[Router] SI ditolak (duplikat): ${data.robot_id}`);
    send(socket, {
      code: 'ERROR',
      data: {
        error: result.error,
        message: `Duplicate ROBOT_ID: ${data.robot_id}`,
        timestamp: new Date().toISOString()
      }
    });
    setTimeout(() => socket.close(4002, 'Duplicate ROBOT_ID'), 100);
    return;
  }
  logger.info(`[Router] robot terdaftar (SI): ${data.robot_id}`);
  send(socket, { code: 'ACK_SOFT', data: { robot_id: data.robot_id, timestamp: new Date().toISOString() } });
}

async function handleUplink(socket, msg) {
  const session = sessionManager.get(socket);
  if (!session || !session.identity || session.identity.type !== 'ROBOT') {
    return send(socket, { code: 'ERROR', data: { error: 'NO_SESSION', message: 'Kirim SI lebih dulu' } });
  }
  const robotId = session.identity.id;
  // Enrichment: robot_id + timestamp + message_id; bentuk {code,data} tetap verbatim.
  const enriched = {
    code: msg.code,
    message_id: msg.message_id || generateMessageId(),
    data: { ...msg.data, robot_id: robotId, timestamp: new Date().toISOString() }
  };
  await kafkaProducer.produce(TOPICS.SIMRS_ROBOT_EVENTS, enriched, robotId);
  broadcastToUis(enriched, robotId);
}

/** Broadcast uplink robot ke sesi UI (tanpa identity) yang match channel. */
function broadcastToUis(frame, robotId) {
  for (const [sock, s] of sessionManager.sessions) {
    if (s.identity || s.channels.size === 0) continue;
    if (!s.channels.has('all') && !s.channels.has(`robot:${robotId}`)) continue;
    send(sock, frame);
  }
}

/**
 * Downlink: envelope ROBOT_COMMAND dari bridge HTTP -> frame TIFA ke socket robot.
 * Robot tidak dikenal/offline -> uplink sintetis
 * ROBOT_COMMAND_RESULT {result:"REJECTED", reason:"UNKNOWN_ROBOT"}
 * (Kafka simrs.robot.events.v1 + broadcast UI) agar dedupe commandId tetap jalan.
 */
async function deliverRobotCommand(envelope) {
  const data = envelope.data || {};
  const robotId = data.robotId;
  const socket = sessionManager.getRobot(robotId);
  if (socket) {
    send(socket, { code: 'ROBOT_COMMAND', data });
    logger.info(`[Router] downlink ROBOT_COMMAND ${data.command || ''} -> ${robotId}`);
    return;
  }
  logger.warn(`[Router] downlink ditolak, robot tidak terhubung: ${robotId}`);
  const result = {
    code: 'ROBOT_COMMAND_RESULT',
    message_id: generateMessageId(),
    data: {
      commandId: data.commandId,
      robotId,
      result: 'REJECTED',
      reason: 'UNKNOWN_ROBOT',
      robot_id: robotId,
      timestamp: new Date().toISOString()
    }
  };
  await kafkaProducer.produce(TOPICS.SIMRS_ROBOT_EVENTS, result, robotId);
  broadcastToUis(result, robotId);
}

async function handleTifa(socket, msg) {
  if (typeof msg.code !== 'string' || !msg.code) {
    return send(socket, { code: 'ERROR', data: { error: 'INVALID_MESSAGE', message: 'code wajib string' } });
  }
  if (msg.code === 'SI') return handleSI(socket, msg.data);
  return handleUplink(socket, msg);
}

/**
 * Router pesan masuk (client -> server):
 * - Jalur UI  : { action: "subscribe", channels: ["all","ward:A","delivery:DELIV-...","robot:<id>"] }
 * - Jalur robot TIFA: { code: "SI"|"STATUS"|"ACK"|..., data: {...} }
 */
async function handleIncoming(socket, rawData) {
  let msg;
  try {
    msg = JSON.parse(rawData.toString());
  } catch {
    sendError(socket, 'INVALID_JSON', 'message is not valid JSON');
    return;
  }

  if (msg && typeof msg === 'object' && 'code' in msg && !('action' in msg)) {
    try {
      await handleTifa(socket, msg);
    } catch (err) {
      logger.error('[Router] TIFA error:', err.message);
      send(socket, { code: 'ERROR', data: { error: 'INTERNAL_ERROR' } });
    }
    return;
  }

  switch (msg && msg.action) {
    case 'subscribe': {
      const keys = parseChannels(msg.channels);
      if (keys.length === 0) {
        sendError(socket, 'NO_VALID_CHANNEL', 'allowed: all | ward:<code> | delivery:<code> | robot:<robotId>');
        return;
      }
      sessionManager.setChannels(socket, keys);
      send(socket, { type: 'SUBSCRIBED', channels: keys });
      logger.debug('[Router] subscribed channels:', keys);
      break;
    }
    default:
      sendError(socket, 'UNKNOWN_ACTION', 'available actions: subscribe');
  }
}

module.exports = { handleIncoming, sendError, send, deliverRobotCommand };
