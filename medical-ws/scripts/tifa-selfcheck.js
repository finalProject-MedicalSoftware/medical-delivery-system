/**
 * Self-check jalur robot TIFA (kontrak docs/api-contracts/robot-ws-tifa.md).
 * Jalankan: node scripts/tifa-selfcheck.js
 * Stub producer Kafka in-proc; server nyata di-start di port 8099.
 *
 * Skenario: SI robot tanpa token; duplikat robot (tanpa close); UI SI token
 * salah/benar; duplikat UI; kick-dead ghost session; subscribe legacy
 * (Bearer) vs anonim; uplink verbatim + enrichment -> SI-UI & legacy UI &
 * Kafka; downlink whitelist/target/inject robot_id/ROBOT_OFFLINE; konversi
 * envelope ROBOT_COMMAND dari /internal/publish; ROBOT_COMMAND_RESULT
 * sintetis untuk robot tak dikenal; GET /internal/robots.
 */
process.env.WS_PORT = process.env.WS_PORT || '8099';
process.env.KAFKA_ENABLED = 'false';
// HARUS sebelum require env.js (dotenv tidak menimpa process.env yang sudah ada).
process.env.WS_AUTH_TOKEN = 'selfcheck-token';
process.env.INTERNAL_PUBLISH_SECRET = 'selfcheck-secret';

const assert = require('assert');
const http = require('http');
const WebSocket = require('ws');
const kafkaProducer = require('../src/kafka/producer');
const serverModule = require('../src/ws/server');

const produced = [];
kafkaProducer.connected = true; // stub: tangkap produce() tanpa broker
kafkaProducer.produce = async (topic, value, key) => {
  produced.push({ topic, value, key });
};

const TOKEN = 'selfcheck-token';
const SECRET = 'selfcheck-secret';
const PORT = 8099;
const URL = `ws://127.0.0.1:${PORT}/ws/v1/deliveries`;

// -- helpers ---------------------------------------------------------------
class Inbox {
  constructor(ws) {
    this.items = [];
    this.waiters = [];
    ws.on('message', (raw) => {
      let m;
      try { m = JSON.parse(raw.toString()); } catch { return; }
      const wi = this.waiters.findIndex((w) => { try { return w.pred(m); } catch { return false; } });
      if (wi >= 0) {
        const [w] = this.waiters.splice(wi, 1);
        clearTimeout(w.t);
        w.resolve(m);
      } else this.items.push(m);
    });
  }
  /** Tunggu pesan berikut yang lolos pred; pesan tak lolos tetap disimpan. */
  next(pred, label, timeoutMs = 3000) {
    return new Promise((resolve, reject) => {
      const idx = this.items.findIndex(pred);
      if (idx >= 0) return resolve(this.items.splice(idx, 1)[0]);
      const grab = {
        pred,
        resolve,
        t: setTimeout(() => {
          this.waiters = this.waiters.filter((w) => w !== grab);
          reject(new Error(`TIMEOUT (${label})`));
        }, timeoutMs)
      };
      this.waiters.push(grab);
    });
  }
}
const isFrame = (m) => m && typeof m === 'object' && Object.prototype.hasOwnProperty.call(m, 'code');
const isType = (m) => m && typeof m === 'object' && Object.prototype.hasOwnProperty.call(m, 'type');

function sock(opts = {}) { return new WebSocket(URL, opts); }
function openSock(opts) {
  return new Promise((resolve, reject) => {
    const ws = sock(opts);
    const inbox = new Inbox(ws); // pasang sebelum open agar pesan awal tak hilang
    ws.on('open', () => resolve({ ws, inbox }));
  });
}
function post(path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request({
      host: '127.0.0.1', port: PORT, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers }
    }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: buf ? JSON.parse(buf) : null }));
    });
    req.on('error', reject);
    req.end(payload);
  });
}
function get(path, headers = {}) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: PORT, path, headers }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: buf ? JSON.parse(buf) : null }));
    }).on('error', reject);
  });
}
function waitClose(ws) {
  return new Promise((resolve) => ws.on('close', (code) => resolve(code)));
}
const producedOn = (topic) => produced.filter((p) => p.topic === topic);

let passed = 0;
function ok(label) { passed += 1; console.log(`  ✓ ${label}`); }

// -- pengujian ---------------------------------------------------------------
(async () => {
  await serverModule.start();

  // 1) SI ROBOT tanpa token -> ACK_SOFT
  let A = await openSock();
  A.inbox.next((x) => isType(x) && x.type === 'SNAPSHOT_REQUIRED', 'A: SNAPSHOT_REQUIRED');
  A.ws.send(JSON.stringify({ code: 'SI', data: { type: 'ROBOT', robot_id: 'nevo' } }));
  let m = await A.inbox.next((x) => isFrame(x) && x.code === 'ACK_SOFT', 'A: ACK_SOFT robot');
  assert.strictEqual(m.data.robot_id, 'nevo');
  ok('SI ROBOT tanpa token -> ACK_SOFT {robot_id, timestamp}');

  // 2) Duplikat robot (A masih ALIVE) -> ERROR DUPLICATE_ROBOT_ID, tanpa close
  const B = await openSock();
  B.ws.send(JSON.stringify({ code: 'SI', data: { type: 'ROBOT', robot_id: 'nevo' } }));
  m = await B.inbox.next((x) => isFrame(x) && x.code === 'ERROR', 'B: ERROR duplikat');
  assert.strictEqual(m.data.error, 'DUPLICATE_ROBOT_ID');
  assert.strictEqual(B.ws.readyState, WebSocket.OPEN, 'socket duplikat tidak boleh ditutup');
  assert.strictEqual(A.ws.readyState, WebSocket.OPEN, 'socket lama tidak boleh di-close');
  ok('SI duplikat -> ERROR DUPLICATE_ROBOT_ID tanpa close');

  // 3) Robot lama normal-close -> detach; SI ulang dari socket baru sukses
  A.ws.close();
  const aClose = await waitClose(A.ws);
  assert.ok(aClose >= 1000); // close bersih, bukan 4401
  A = await openSock();
  A.ws.send(JSON.stringify({ code: 'SI', data: { type: 'ROBOT', robot_id: 'nevo' } }));
  m = await A.inbox.next((x) => isFrame(x) && x.code === 'ACK_SOFT', 'A(baru): ACK_SOFT re-register');
  ok('Robot A close bersih + SI ulang -> ACK_SOFT');

  // 4) UI SI token salah -> UNAUTHORIZED (tanpa close), lalu token benar di socket yang sama
  const U0 = await openSock();
  U0.ws.send(JSON.stringify({ code: 'SI', data: { type: 'UI', ui_id: 'ui-test', token: 'salah' } }));
  m = await U0.inbox.next((x) => isFrame(x) && x.code === 'ERROR', 'U0: UNAUTHORIZED');
  assert.strictEqual(m.data.error, 'UNAUTHORIZED');
  assert.strictEqual(U0.ws.readyState, WebSocket.OPEN);
  U0.ws.send(JSON.stringify({ code: 'SI', data: { type: 'UI', ui_id: 'ui-test', token: TOKEN } }));
  m = await U0.inbox.next((x) => isFrame(x) && x.code === 'ACK_SOFT', 'U0: ACK_SOFT UI');
  assert.strictEqual(m.data.ui_id, 'ui-test');
  ok('UI SI: token salah -> UNAUTHORIZED; token benar -> ACK_SOFT {ui_id}');

  // 5) Duplikat UI -> DUPLICATE_UI_ID tanpa close
  const U2 = await openSock();
  U2.ws.send(JSON.stringify({ code: 'SI', data: { type: 'UI', ui_id: 'ui-test', token: TOKEN } }));
  m = await U2.inbox.next((x) => isFrame(x) && x.code === 'ERROR', 'U2: DUPLICATE_UI_ID');
  assert.strictEqual(m.data.error, 'DUPLICATE_UI_ID');
  assert.strictEqual(U2.ws.readyState, WebSocket.OPEN);
  ok('UI duplikat -> ERROR DUPLICATE_UI_ID tanpa close');

  // 6) Legacy UI (Bearer valid) subscribe robot:nevo + all; anonim ditolak
  const L = await openSock({ headers: { Authorization: `Bearer ${TOKEN}` } });
  L.ws.send(JSON.stringify({ action: 'subscribe', channels: ['robot:nevo', 'all'] }));
  m = await L.inbox.next((x) => isType(x) && x.type === 'SUBSCRIBED', 'L: SUBSCRIBED');
  assert.deepStrictEqual(m.channels.sort(), ['all', 'robot:nevo']);
  ok('Legacy UI Bearer valid -> subscribe diterima');

  const AN = await openSock(); // anonim, tanpa SI
  AN.ws.send(JSON.stringify({ action: 'subscribe', channels: ['all'] }));
  m = await AN.inbox.next((x) => isType(x) && x.type === 'ERROR', 'AN: subscribe ditolak');
  assert.strictEqual(m.code, 'UNAUTHORIZED', 'subscribe anonim wajib ditolak');
  AN.ws.send(JSON.stringify({ code: 'READY', data: {} }));
  m = await AN.inbox.next((x) => isFrame(x) && x.code === 'ERROR', 'AN: uplink tanpa SI');
  assert.strictEqual(m.data.error, 'NO_SESSION');
  ok('Anonim: subscribe legacy ditolak + uplink tanpa SI -> NO_SESSION');

  // 7) Uplink READY dari robot 'nevo' (socket A) -> SI-UI menerima verbatim enriched + Kafka
  A.ws.send(JSON.stringify({ code: 'READY', data: { mode: 'IDLE', ready: true } }));
  m = await U0.inbox.next((x) => isFrame(x) && x.code === 'READY', 'U0: READY');
  assert.strictEqual(m.data.robot_id, 'nevo');
  assert.strictEqual(m.data.mode, 'IDLE');
  assert.ok(m.data.timestamp && m.message_id, 'enrichment timestamp+message_id');
  const up = producedOn(require('../src/kafka/config').TOPICS.SIMRS_ROBOT_EVENTS);
  assert.ok(up.some((p) => p.value.code === 'READY' && p.key === 'nevo'), 'Kafka uplink READY');
  ok('Uplink READY direlay ke SI-UI (enriched) + Kafka');

  // 8) Uplink juga ke legacy UI via channel robot:nevo
  A.ws.send(JSON.stringify({ code: 'BATTERY', data: { battery_percent: 88.5 } }));
  m = await L.inbox.next((x) => isFrame(x) && x.code === 'BATTERY', 'L: BATTERY');
  assert.strictEqual(m.data.robot_id, 'nevo');
  ok('Uplink BATTERY sampai legacy UI (channel robot:nevo)');

  // 9) Downlink dari SI-UI: whitelist, ROBOT_OFFLINE, targeted, broadcast
  U0.ws.send(JSON.stringify({ code: 'SUDO', data: {} }));
  m = await U0.inbox.next((x) => isFrame(x) && x.code === 'ERROR', 'U0: CODE_NOT_ALLOWED');
  assert.strictEqual(m.data.error, 'CODE_NOT_ALLOWED');
  ok('Downlink kode non-whitelist -> CODE_NOT_ALLOWED');

  U0.ws.send(JSON.stringify({ code: 'TELEOP', data: { robot_id: 'hantu', linear: { x: 0.2, y: 0, z: 0 }, angular: { x: 0, y: 0, z: 0.5 } } }));
  m = await U0.inbox.next((x) => isFrame(x) && x.code === 'ERROR', 'U0: ROBOT_OFFLINE');
  assert.strictEqual(m.data.error, 'ROBOT_OFFLINE');
  assert.strictEqual(m.data.robot_id, 'hantu');
  ok('Downlink ke robot offline -> ERROR ROBOT_OFFLINE');

  U0.ws.send(JSON.stringify({ code: 'TELEOP', data: { robot_id: 'nevo', linear: { x: 0.2, y: 0, z: 0 }, angular: { x: 0, y: 0, z: 0.5 } } }));
  m = await A.inbox.next((x) => isFrame(x) && x.code === 'TELEOP', 'A: TELEOP');
  assert.strictEqual(m.data.robot_id, 'nevo');
  assert.strictEqual(m.data.linear.x, 0.2);
  assert.strictEqual(m.data.angular.z, 0.5);
  ok('Downlink TELEOP targeted -> robot terima, robot_id di-inject');

  // Robot kedua untuk broadcast
  const C = await openSock();
  C.ws.send(JSON.stringify({ code: 'SI', data: { type: 'ROBOT', robot_id: 'nevo-2' } }));
  await C.inbox.next((x) => isFrame(x) && x.code === 'ACK_SOFT', 'C: ACK_SOFT');
  U0.ws.send(JSON.stringify({ code: 'MAPPING_START', data: {} })); // tanpa target -> broadcast
  m = await A.inbox.next((x) => isFrame(x) && x.code === 'MAPPING_START', 'A: broadcast');
  m = await C.inbox.next((x) => isFrame(x) && x.code === 'MAPPING_START', 'C: broadcast');
  ok('Downlink tanpa target -> broadcast ke semua robot terdaftar');

  // Target via bentuk legacy top-level {action:'robot', id}
  U0.ws.send(JSON.stringify({ action: 'robot', id: 'nevo', code: 'MAPPING_STOP', data: {} }));
  m = await A.inbox.next((x) => isFrame(x) && x.code === 'MAPPING_STOP', 'A: MAPPING_STOP legacy target');
  assert.strictEqual(m.data.robot_id, 'nevo');
  ok('Downlink target bentuk legacy {action:"robot", id} didukung');

  // 10) Envelope ROBOT_COMMAND via /internal/publish -> konversi frame TIFA
  const pub = await post('/internal/publish', {
    v: 1, eventId: 'e-cmd-1', type: 'ROBOT_COMMAND',
    occurredAt: new Date().toISOString(), requestCode: 'REQ-1', wardCode: 'A',
    data: { commandId: 'cmd-1', robotId: 'nevo', command: 'MOVE', params: { goal_x: 1, goal_y: 2 } }
  }, { 'X-Internal-Secret': SECRET });
  assert.strictEqual(pub.status, 202);
  m = await A.inbox.next((x) => isFrame(x) && x.code === 'MOVE', 'A: MOVE via envelope');
  assert.strictEqual(m.data.command_id, 'cmd-1');
  assert.strictEqual(m.data.robot_id, 'nevo');
  assert.strictEqual(m.data.goal_x, 1);
  ok('Envelope ROBOT_COMMAND -> frame TIFA {code, data{...params, robot_id, command_id}}');

  // 11) Robot tak dikenal -> ROBOT_COMMAND_RESULT sintetis (Kafka + SI-UI)
  const pub2 = await post('/internal/publish', {
    v: 1, eventId: 'e-cmd-2', type: 'ROBOT_COMMAND',
    occurredAt: new Date().toISOString(), requestCode: 'REQ-2', wardCode: 'A',
    data: { commandId: 'cmd-2', robotId: 'hantu', command: 'MOVE', params: {} }
  }, { 'X-Internal-Secret': SECRET });
  assert.strictEqual(pub2.status, 202);
  m = await U0.inbox.next((x) => isFrame(x) && x.code === 'ROBOT_COMMAND_RESULT', 'U0: ROBOT_COMMAND_RESULT');
  assert.strictEqual(m.data.commandId, 'cmd-2');
  assert.strictEqual(m.data.result, 'REJECTED');
  assert.strictEqual(m.data.reason, 'UNKNOWN_ROBOT');
  assert.ok(producedOn(require('../src/kafka/config').TOPICS.SIMRS_ROBOT_EVENTS).some((p) => p.value.code === 'ROBOT_COMMAND_RESULT' && p.value.data.commandId === 'cmd-2'), 'result sintetis ke Kafka');
  ok('Robot tak dikenal -> ROBOT_COMMAND_RESULT REJECTED/UNKNOWN_ROBAT (Kafka+UI)'.replace('ROBAT', 'BOT'));

  // 12) Bridge secret salah -> 401
  const bad = await post('/internal/publish', { v: 1, eventId: 'e-x', type: 'X' }, { 'X-Internal-Secret': 'wrong' });
  assert.strictEqual(bad.status, 401);
  ok('/internal/publish secret salah -> 401');

  // 13) GET /internal/robots
  const robots = await get('/internal/robots', { 'X-Internal-Secret': SECRET });
  assert.strictEqual(robots.status, 200);
  assert.ok(robots.body.robots.includes('nevo') && robots.body.robots.includes('nevo-2'), JSON.stringify(robots.body));
  const noSecret = await get('/internal/robots');
  assert.strictEqual(noSecret.status, 401);
  ok('GET /internal/robots: daftar robot + 401 tanpa secret');

  // 14) Upgrade Bearer salah -> close 4401
  const badWs = sock({ headers: { Authorization: 'Bearer tokon-salah' } });
  badWs.on('error', () => {});
  const code = await waitClose(badWs);
  assert.strictEqual(code, 4401);
  ok('Upgrade Bearer salah -> close 4401');

  // 15) Unit: kick-dead ghost di SessionManager (deterministik, tanpa socket nyata)
  const sm = serverModule._internal.sessionManager;
  const OPEN = 1, CLOSED = 3;
  const ghost = { readyState: CLOSED, OPEN };
  const live = { readyState: OPEN, OPEN };
  sm.attach(ghost); sm.attach(live);
  assert.strictEqual(sm.attachRobot(ghost, 'ghost-unit').success, true);
  const r2 = sm.attachRobot(live, 'ghost-unit'); // ghost DEAD -> dikick, live langsung sukses
  assert.strictEqual(r2.success, true, `kick-dead harus sukses: ${JSON.stringify(r2)}`);
  assert.strictEqual(sm.robots.get('ghost-unit'), live);
  sm.detach(live);
  sm.detach(ghost);
  // duplikat ALIVE di unit level
  const l1 = { readyState: OPEN, OPEN };
  const l2 = { readyState: OPEN, OPEN };
  sm.attach(l1); sm.attach(l2);
  sm.attachRobot(l1, 'unit-dup');
  assert.strictEqual(sm.attachRobot(l2, 'unit-dup').error, 'DUPLICATE_ROBOT_ID');
  sm.detach(l1);
  ok('Kick-dead ghost + duplicate ALIVE (unit SessionManager)');

  console.log(`\nSemua ${passed} asersi tifa-selfcheck LULUS ✅\n`);
  serverModule.stop();
  process.exit(0);
})().catch((err) => {
  console.error('\n✗ tifa-selfcheck GAGAL:', err && err.message ? err.message : err);
  serverModule.stop();
  process.exit(1);
});
