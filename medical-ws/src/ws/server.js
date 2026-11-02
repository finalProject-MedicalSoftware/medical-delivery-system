const http = require('http');
const crypto = require('crypto');
const WebSocket = require('ws');
const config = require('../config/env');
const logger = require('../utils/logger');
const sessionManager = require('./session-manager');
const router = require('./router');
const kafkaProducer = require('../kafka/producer');
const { TOPICS } = require('../kafka/config');
const { envelopeMatchesAny, isValidEnvelope } = require('../core/channels');
const Dedupe = require('../core/dedupe');

let kafkaConsumerInst = null;
const dedupe = new Dedupe(config.DEDUPE_TTL_MS);
let wss = null;

// ---------------------------------------------------------------------------
// Broadcast: envelope dari Kafka -> semua socket dengan channel match.
// ---------------------------------------------------------------------------
async function onDeliveryEvent(raw) {
  let envelope;
  try {
    envelope = JSON.parse(raw);
  } catch {
    logger.warn('[Server] invalid JSON on topic -> DLQ');
    await kafkaProducer.produceDlq('INVALID_JSON', raw);
    return;
  }

  const result = handleEnvelope(envelope);
  if (result.ok) return;
  if (result.reason === 'INVALID_ENVELOPE') {
    logger.warn('[Server] envelope tidak valid -> DLQ', envelope && envelope.eventId);
    await kafkaProducer.produceDlq('INVALID_ENVELOPE', raw);
    return;
  }
  logger.debug('[Server] duplikat eventId, dilewati:', envelope.eventId);
}

/**
 * Jalur bersama Kafka + bridge HTTP: validasi -> dedupe -> broadcast.
 * @returns {{ok: true} | {ok: false, reason: 'INVALID_ENVELOPE'|'DUPLICATE'}}
 */
function handleEnvelope(envelope) {
  if (!isValidEnvelope(envelope)) return { ok: false, reason: 'INVALID_ENVELOPE' };
  if (dedupe.seen(envelope.eventId)) return { ok: false, reason: 'DUPLICATE' };
  broadcast(envelope);
  return { ok: true };
}

function canReceive(socket, envelope) {
  return sessionManager.socketMatches(socket, envelope, envelopeMatchesAny);
}

function broadcast(envelope) {
  let sent = 0;
  wss.clients.forEach((socket) => {
    if (socket.readyState !== WebSocket.OPEN) return;
    try {
      if (!canReceive(socket, envelope)) return;
      socket.send(JSON.stringify(envelope));
      sent += 1;
    } catch (err) {
      logger.error('[Server] broadcast error:', err.message);
    }
  });
  logger.debug('[Server] broadcast:', envelope.type, envelope.eventId, 'ke', sent, 'klien');
}

// ---------------------------------------------------------------------------
// Heartbeat: server ping tiap 15s, klien wajib pong dalam 15s, else terminate.
// ---------------------------------------------------------------------------
function startHeartbeat() {
  const interval = setInterval(() => {
    wss.clients.forEach((socket) => {
      if (sessionManager.isAlive(socket) === false) {
        socket.terminate();
        return;
      }
      sessionManager.setAlive(socket, false);
      socket.ping();
    });
  }, config.PING_INTERVAL_MS);
  interval.unref();
}

function clearAlive(socket) {
  sessionManager.setAlive(socket, true);
  socket.removeAllListeners('pong');
  socket.on('pong', () => sessionManager.setAlive(socket, true));
}

// ---------------------------------------------------------------------------
// Auth di handshake (kontrak 2.3): Bearer token; gagal -> close 4401.
// ponytail: cookie sesi browser belum didukung — fase mock mesin/token saja.
// Tambah ekstrak cookie simrs_session di sini saat auth browser masuk kontrak.
// ---------------------------------------------------------------------------
function authorizeUpgrade(req) {
  if (!config.WS_AUTH_TOKEN) return false; // tanpa token env -> tolak semua
  const auth = req.headers.authorization || '';
  return auth === `Bearer ${config.WS_AUTH_TOKEN}`;
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        req.destroy();
        reject(Object.assign(new Error('BODY_TOO_LARGE'), { code: 'BODY_TOO_LARGE' }));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function secretOk(header) {
  const secret = config.INTERNAL_PUBLISH_SECRET;
  if (!secret || typeof header !== 'string') return false;
  const given = Buffer.from(header);
  const expected = Buffer.from(secret);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

// Bridge HTTP dari backend (kontrak: docs/api-contracts/monitoring-events.md).
// ponytail: tanpa TLS/rate-limit — jalur internal loopback; pindah ke Kafka saat multi-node.
async function handlePublish(req, res) {
  const send = (code, body) => {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  if (!secretOk(req.headers['x-internal-secret'])) return send(401, { error: 'UNAUTHORIZED' });

  let raw;
  try {
    raw = await readBody(req, config.INTERNAL_PUBLISH_MAX_BYTES);
  } catch (err) {
    return send(err.code === 'BODY_TOO_LARGE' ? 413 : 400, { error: err.code || 'BAD_REQUEST' });
  }

  let envelope;
  try {
    envelope = JSON.parse(raw);
  } catch {
    return send(400, { error: 'INVALID_JSON' });
  }

  const result = handleEnvelope(envelope);
  if (!result.ok) return send(400, { error: result.reason });

  // Bridge -> Kafka: forward ke `simrs.delivery.events.v1` (key=requestCode) agar
  // HMI/konsumen lain menerima event jalur backend. No-op saat Kafka off/belum connect.
  await kafkaProducer.produce(TOPICS.SIMRS_DELIVERY_EVENTS, envelope, envelope.requestCode);

  return send(202, { accepted: true });
}

function startHttp() {
  const server = http.createServer((req, res) => {
    if (req.url === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', kafka: kafkaConsumerInst ? kafkaConsumerInst.connected : false }));
      return;
    }
    if (req.url === '/internal/publish' && req.method === 'POST') {
      handlePublish(req, res).catch((err) => {
        logger.error('[Bridge] publish error:', err.message);
        if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'INTERNAL_ERROR' }));
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });
  return server;
}

async function connectKafkaWithRetry() {
  // Kafka gagal tetap semai WS; coba lagi 10 detik — SNAPSHOT_REQUIRED
  // dan polling fallback di sisi klien tetap kontrak final.
  try {
    await kafkaConsumerInst.start();
    return;
  } catch (err) {
    logger.error('[Server] Kafka gagal, retry 10s:', err.message);
    setTimeout(connectKafkaWithRetry, 10000).unref();
  }
}

async function start() {
  logger.info('='.repeat(60));
  logger.info('🚚 MEDICAL WS GATEWAY');
  logger.info('='.repeat(60));

  // ponytail: Kafka opsional (KAFKA_ENABLED). Bridge HTTP jalan tanpa broker;
  // nyalakan flag ini saat broker hidup, jangan tambah kode lain.
  if (config.KAFKA_ENABLED) {
    kafkaConsumerInst = new (require('../kafka/consumer'))({ onEvent: onDeliveryEvent });
    try {
      await kafkaProducer.connect();
    } catch (err) {
      logger.warn('[Server] Kafka producer belum tersedia (DLQ off):', err.message);
    }
    connectKafkaWithRetry();
  } else {
    logger.info('[Server] Kafka dimatikan (KAFKA_ENABLED=false) — mode bridge HTTP saja');
  }

  const server = startHttp();
  wss = new WebSocket.Server({ server, path: config.WS_PATH });

  wss.on('connection', (socket, req) => {
    clearAlive(socket);

    if (!authorizeUpgrade(req)) {
      socket.close(4401, 'UNAUTHORIZED');
      return;
    }

    const url = new URL(req.url, 'http://x');
    logger.info('[WS] connect:', req.socket.remoteAddress, url.pathname);

    // Koneksi baru -> klien harus resync penuh via read API (kontrak 2.4 poin 3).
    socket.send(JSON.stringify({ type: 'SNAPSHOT_REQUIRED', reason: 'CONNECT' }));

    sessionManager.attach(socket);
    socket.on('message', (data) => router.handleIncoming(socket, data));
    socket.on('close', () => {
      sessionManager.detach(socket);
      logger.info('[WS] disconnect');
    });
    socket.on('error', (err) => logger.error('[WS] socket error:', err.message));
  });

  wss.on('error', (err) => logger.error('[WS] server error:', err.message));

  startHeartbeat();

  await new Promise((resolve) => server.listen(config.WS_PORT, resolve));
  logger.info(`[Server] WS listening on :${config.WS_PORT}${config.WS_PATH}`);
}

function stop() {
  setTimeout(() => process.exit(0), 1000); // beri waktu close sisa socket
  if (wss) for (const socket of wss.clients) socket.terminate();
  wss.close();
  kafkaConsumerInst && kafkaConsumerInst.stop().catch(() => {});
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);

if (require.main === module) start();

module.exports = { start, stop, onDeliveryEvent, broadcast, _internal: { dedupe, sessionManager } };
