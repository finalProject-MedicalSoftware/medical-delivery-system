const logger = require('../utils/logger');
const config = require('../config/env');
const { parseChannels } = require('../core/channels');
const sessionManager = require('./session-manager');
const kafkaProducer = require('../kafka/producer');
const { TOPICS } = require('../kafka/config');
const { generateMessageId } = require('../utils/uuid');
const registry = require('./registry-client');
const backendEvents = require('./backend-events');
const { uiFrame, commandFrames } = require('../core/robot-frames');

const teleopCfg = () => ({ maxLinear: config.TELEOP_MAX_LINEAR, maxAngular: config.TELEOP_MAX_ANGULAR });

function send(socket, payload) {
  if (socket.readyState !== socket.OPEN) return false;
  socket.send(JSON.stringify(payload));
  return true;
}

function sendError(socket, code, detail) {
  send(socket, { type: 'ERROR', code, detail });
}

// ---------------------------------------------------------------------------
// Protokol robot TIFA (kontrak docs/api-contracts/robot-ws-tifa.md):
// - SI di dalam sesi (bukan di upgrade): ROBOT tanpa token, UI wajib token
//   (WS_AUTH_TOKEN kosong -> semua SI UI ditolak). Upgrade anonim.
// - Duplicate -> ERROR berisi DUPLICATE_ROBOT_ID / DUPLICATE_UI_ID (string
//   persis, klien deteksi via substring), socket TIDAK ditutup paksa —
//   klien retry sendiri.
// - Uplink robot direlay verbatim (enrichment robot_id/timestamp/message_id)
//   ke Kafka + semua sesi UI; downlink UI->robot direlay verbatim dua arah.
// ---------------------------------------------------------------------------

async function handleSI(socket, data) {
  if (!data || typeof data !== 'object') {
    send(socket, { code: 'ERROR', data: { error: 'INVALID_SI', message: 'SI wajib {type:"ROBOT"|"UI", ...}' } });
    return;
  }
  if (data.type === 'ROBOT') {
    if (typeof data.robot_id !== 'string' || !data.robot_id) {
      send(socket, { code: 'ERROR', data: { error: 'INVALID_SI', message: 'SI ROBOT wajib robot_id:string' } });
      return;
    }
    const registered = await registry.lookup(data.robot_id);
    if (!registered.ok) {
      send(socket, { code: 'ERROR', data: { error: registered.reason } });
      return;
    }
    if (!sessionManager.get(socket) || socket.readyState !== socket.OPEN) return;
    const result = sessionManager.attachRobot(socket, data.robot_id);
    if (!result.success) {
      logger.warn(`[Router] SI ROBOT ditolak (duplikat): ${data.robot_id}`);
      send(socket, {
        code: 'ERROR',
        data: { error: 'DUPLICATE_ROBOT_ID', message: `Duplicate ROBOT_ID: ${data.robot_id}`, timestamp: new Date().toISOString() }
      });
      return;
    }
    logger.info(`[Router] robot cocok dengan registry, identitas fisik belum terautentikasi: ${data.robot_id}`);
    send(socket, { code: 'ACK_SOFT', data: { robot_id: data.robot_id, authenticated: false, timestamp: new Date().toISOString() } });
    return;
  }
  if (data.type === 'UI') {
    const uiId = typeof data.ui_id === 'string' ? data.ui_id : '';
    if (!uiId || typeof data.token !== 'string' || !data.token) {
      send(socket, { code: 'ERROR', data: { error: 'INVALID_SI', message: 'SI UI wajib {ui_id:string, token:string}' } });
      return;
    }
    if (!config.WS_AUTH_TOKEN || data.token !== config.WS_AUTH_TOKEN) {
      logger.warn(`[Router] SI UI ditolak (token): ${uiId}`);
      send(socket, { code: 'ERROR', data: { error: 'UNAUTHORIZED', message: 'Token UI tidak valid' } });
      return;
    }
    const result = sessionManager.attachUI(socket, uiId);
    if (!result.success) {
      logger.warn(`[Router] SI UI ditolak (duplikat): ${uiId}`);
      send(socket, {
        code: 'ERROR',
        data: { error: 'DUPLICATE_UI_ID', message: `Duplicate UI_ID: ${uiId}`, timestamp: new Date().toISOString() }
      });
      return;
    }
    logger.info(`[Router] UI terdaftar (SI): ${uiId}`);
    send(socket, { code: 'ACK_SOFT', data: { ui_id: uiId, timestamp: new Date().toISOString() } });
    return;
  }
  send(socket, { code: 'ERROR', data: { error: 'INVALID_SI', message: 'type wajib ROBOT atau UI' } });
}

async function handleUplink(socket, msg) {
  const session = sessionManager.get(socket);
  if (!session || !session.identity || session.identity.type !== 'ROBOT') {
    return send(socket, { code: 'ERROR', data: { error: 'NO_SESSION', message: 'Kirim SI ROBOT lebih dulu' } });
  }
  const robotId = session.identity.id;
  // Enrichment: robot_id + timestamp + message_id; bentuk {code,data} tetap verbatim.
  const enriched = {
    code: msg.code,
    message_id: msg.message_id || generateMessageId(),
    data: { ...msg.data, robot_id: robotId, timestamp: new Date().toISOString(),
      device_authenticated: false }
  };
  await kafkaProducer.produce(TOPICS.SIMRS_ROBOT_EVENTS, enriched, robotId);
  broadcastToUis(enriched, robotId);
  backendEvents.forward(enriched);
}

/** Relay uplink robot ke sesi UI: sesi SI-UI menerima SEMUA (by identity),
 *  UI legacy (tanpa identity) tetap by channel `all`/`robot:<id>` (tanpa frame dobel). */
function broadcastToUis(frame, robotId) {
  for (const [sock, s] of sessionManager.sessions) {
    if (s.identity && s.identity.type === 'UI') {
      send(sock, frame);
    } else if (!s.identity && s.channels.size > 0) {
      if (s.channels.has('all') || s.channels.has(`robot:${robotId}`)) send(sock, frame);
    }
  }
}

/**
 * Umumkan robot OFFLINE saat socket SI ROBOT terputus. Ini mengisi kontrak
 * join/leave roster agar BFF tidak mempertahankan status READY yang stale.
 * Event ini hanya menyatakan koneksi gateway putus; bukan bukti robot berhenti.
 */
function handleDisconnect(socket) {
  const session = sessionManager.get(socket);
  if (!session || !session.identity || session.identity.type !== 'ROBOT') return;
  const robotId = session.identity.id;
  const frame = {
    code: 'READY',
    message_id: generateMessageId(),
    data: { robot_id: robotId, status: 'OFFLINE', mode: 'OFFLINE', timestamp: new Date().toISOString() }
  };
  broadcastToUis(frame, robotId);
  kafkaProducer.produce(TOPICS.SIMRS_ROBOT_EVENTS, frame, robotId)
    .catch((err) => logger.error('[Router] publish robot OFFLINE gagal:', err.message));
}

// ---------------------------------------------------------------------------
// Downlink UI -> robot. Hanya dari sesi SI-UI; kode whitelist. Target:
// data.robot_id (atau top-level {action:'robot', id}) -> satu robot
// (robot_id di-inject); absen -> broadcast semua robot (robot filter sendiri,
// ACK IGNORED bila bukan miliknya).
// ---------------------------------------------------------------------------

const DOWNLINK_CODES = new Set([
  'TELEOP', 'MOVE', 'OP', 'MODE',
  'MAPPING_START', 'MAPPING_STOP', 'MAPPING_SAVE', 'MAPPING_FLAG',
  'MAP_SELECTED', 'MAP_DATA',
  'INTERRUPT', 'INTERRUPT_CONFIRM', 'INTERRUPT_CANCEL',
  'PICKUP_CONFIRM',
  // HMI tablet -> robot (bukan gerak): selesai menjelaskan obat, status video call
  'PRESENT_DONE', 'CALL_STATE'
]);
const NON_MOTION_CODES = new Set(['PRESENT_DONE', 'CALL_STATE']);

function resolveTarget(msg) {
  const d = msg.data;
  if (d && typeof d === 'object' && typeof d.robot_id === 'string' && d.robot_id.trim()) return d.robot_id.trim();
  if (msg.action === 'robot' && typeof msg.id === 'string' && msg.id.trim()) return msg.id.trim();
  return null;
}

function isTargetedStop(code, data) {
  return code === 'TELEOP' && data && typeof data === 'object' &&
    data.linear === 0 && data.angular === 0;
}

async function handleUIDownlink(socket, msg) {
  const session = sessionManager.get(socket);
  if (!session || !session.identity || session.identity.type !== 'UI') {
    return send(socket, { code: 'ERROR', data: { error: 'UI_SESSION_REQUIRED', message: 'Downlink hanya dari sesi SI UI' } });
  }
  if (!DOWNLINK_CODES.has(msg.code)) {
    return send(socket, { code: 'ERROR', data: { error: 'CODE_NOT_ALLOWED', message: `Kode downlink tidak diizinkan: ${msg.code}` } });
  }
  const target = resolveTarget(msg);
  if (!target) return send(socket, { code: 'ERROR', data: { error: 'ROBOT_ID_REQUIRED' } });
  if (!config.ALLOW_ROBOT_MOTION && !NON_MOTION_CODES.has(msg.code) && !isTargetedStop(msg.code, msg.data)) {
    return send(socket, { code: 'ERROR', data: { error: 'DEVICE_AUTH_UNAVAILABLE' } });
  }
  const eligible = await registry.lookup(target);
  if (!eligible.ok) return send(socket, { code: 'ERROR', data: { error: eligible.reason } });
  const sock = sessionManager.getRobot(target);
  if (!sock) return send(socket, { code: 'ERROR', data: { error: 'ROBOT_OFFLINE', robot_id: target } });
  const frame = uiFrame(msg.code, { ...msg.data, robot_id: target }, teleopCfg());
  if (!frame) return send(socket, { code: 'ERROR', data: { error: 'INVALID_PARAMS', robot_id: target } });
  const delivered = send(sock, frame);
  send(socket, {
    code: isTargetedStop(msg.code, msg.data) ? 'STOP_DELIVERY' : 'DOWNLINK_SENT',
    data: { robot_id: target, sent: msg.code, outcome: delivered ? 'SENT_UNCONFIRMED' : 'UNKNOWN' }
  });
}

/**
 * Downlink envelope ROBOT_COMMAND dari bridge HTTP backend (kontrak
 * robot-command.md) -> dikonversi frame TIFA verbatim ke robot. Robot tak
 * dikenal/offline -> uplink sintetis ROBOT_COMMAND_RESULT {REJECTED,
 * UNKNOWN_ROBOT} (Kafka + broadcast UI) agar dedupe commandId tetap jalan.
 */
async function deliverRobotCommand(envelope) {
  const data = envelope.data || {};
  const robotId = data.robotId || data.robot_id;
  if (typeof robotId !== 'string' || !robotId.trim()) return { accepted: false, reason: 'ROBOT_ID_REQUIRED' };
  // Terjemahkan ke frame TIFA yang dimengerti robot (src/core/robot-frames.js).
  const built = commandFrames(data.command, data.params, robotId, data.commandId, teleopCfg());
  if (built.error) return { accepted: false, reason: built.error };
  // Administrative eligibility is checked even though hardware possession cannot yet be proved.
  const eligible = await registry.lookup(robotId);
  if (!eligible.ok) return { accepted: false, reason: eligible.reason };
  // Tanpa ALLOW_ROBOT_MOTION hanya "stop nol" yang boleh (identitas fisik belum terautentikasi).
  if (!config.ALLOW_ROBOT_MOTION &&
      (data.command !== 'CMD_TELEOP_DRIVE' || !data.params || data.params.linear !== 0 || data.params.angular !== 0)) {
    return { accepted: false, reason: 'DEVICE_AUTH_UNAVAILABLE' };
  }
  const socket = sessionManager.getRobot(robotId);
  if (socket) {
    let sent = send(socket, built.frames[0]);
    // Frame berikutnya (mis. INTERRUPT lalu INTERRUPT_CONFIRM) diberi jeda agar robot sempat berpindah mode.
    built.frames.slice(1).forEach((f, i) => setTimeout(() => send(socket, f), 400 * (i + 1)));
    return { accepted: sent, reason: sent ? 'SENT_UNCONFIRMED' : 'ROBOT_OFFLINE' };
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
  return { accepted: false, reason: 'ROBOT_OFFLINE' };
}

async function handleTifa(socket, msg) {
  if (typeof msg.code !== 'string' || !msg.code) {
    return send(socket, { code: 'ERROR', data: { error: 'INVALID_MESSAGE', message: 'code wajib string' } });
  }
  if (msg.code === 'SI') return handleSI(socket, msg.data);
  const session = sessionManager.get(socket);
  if (session && session.identity && session.identity.type === 'UI') {
    return handleUIDownlink(socket, msg);
  }
  return handleUplink(socket, msg);
}

/**
 * Router pesan masuk (client -> server):
 * - Jalur TIFA  : { code: "SI"|"TELEOP"|"ACK"|"READY"|..., data: {...} }
 * - Jalur UI lama: { action: "subscribe", channels: [...] }
 */
async function handleIncoming(socket, rawData) {
  let msg;
  try {
    msg = JSON.parse(rawData.toString());
  } catch {
    sendError(socket, 'INVALID_JSON', 'message is not valid JSON');
    return;
  }

  if (msg && typeof msg === 'object' && 'code' in msg) {
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
      const s = sessionManager.get(socket);
      // Jalur subscribe legacy wajib Bearer valid (atau sesi SI UI yang
      // sendiri ikut langganan envelope delivery).
      if (!s || (!s.bearer && !(s.identity && s.identity.type === 'UI'))) {
        sendError(socket, 'UNAUTHORIZED', 'subscribe legacy wajib Bearer valid atau sesi SI UI');
        return;
      }
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

module.exports = { handleIncoming, handleDisconnect, sendError, send, deliverRobotCommand };
