// Isolated routing checks: no listener, backend, Kafka broker, simulator, or physical robot.
const assert = require('node:assert/strict');
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'dotenv') return { config() {} };
  return originalLoad.call(this, request, parent, isMain);
};
process.env.WS_AUTH_TOKEN = 'isolated-ui-token';
const producerPath = require.resolve('../src/kafka/producer');
require.cache[producerPath] = { id: producerPath, filename: producerPath, loaded: true,
  exports: { produce: async () => {} } };
const kafkaConfigPath = require.resolve('../src/kafka/config');
require.cache[kafkaConfigPath] = { id: kafkaConfigPath, filename: kafkaConfigPath, loaded: true,
  exports: { TOPICS: { SIMRS_ROBOT_EVENTS: 'isolated' } } };
const uuidPath = require.resolve('../src/utils/uuid');
require.cache[uuidPath] = { id: uuidPath, filename: uuidPath, loaded: true,
  exports: { generateMessageId: () => 'isolated-message' } };
const registry = require('../src/ws/registry-client');
const sessions = require('../src/ws/session-manager');
registry.lookup = async (id) => id === 'verified-1' || id === 'verified-2'
  ? { ok: true, registrationStatus: 'VERIFIED' }
  : { ok: false, reason: 'ROBOT_NOT_ELIGIBLE' };
const router = require('../src/ws/router');

function socket() {
  return { OPEN: 1, readyState: 1, frames: [],
    send(raw) { this.frames.push(JSON.parse(raw)); } };
}
async function frame(sock, code, data) {
  await router.handleIncoming(sock, Buffer.from(JSON.stringify({ code, data })));
}
function last(sock) { return sock.frames.at(-1); }

(async () => {
  const ui = socket(), a = socket(), b = socket(), unknown = socket();
  for (const s of [ui, a, b, unknown]) sessions.attach(s);
  await frame(ui, 'SI', { type: 'UI', ui_id: 'test-ui', token: 'isolated-ui-token' });
  await frame(unknown, 'SI', { type: 'ROBOT', robot_id: 'draft-1' });
  assert.equal(last(unknown).data.error, 'ROBOT_NOT_ELIGIBLE');
  await frame(a, 'SI', { type: 'ROBOT', robot_id: 'verified-1' });
  await frame(b, 'SI', { type: 'ROBOT', robot_id: 'verified-2' });
  assert.equal(sessions.get(a).identity.authenticated, false);
  const aStart = a.frames.length, bStart = b.frames.length;
  await frame(ui, 'TELEOP', { linear: 0.4, angular: 0 });
  assert.equal(last(ui).data.error, 'ROBOT_ID_REQUIRED');
  await frame(ui, 'TELEOP', { robot_id: 'verified-1', linear: 0.4, angular: 0 });
  assert.equal(last(ui).data.error, 'DEVICE_AUTH_UNAVAILABLE');
  assert.equal(a.frames.length, aStart);
  assert.equal(b.frames.length, bStart);
  await frame(ui, 'TELEOP', { robot_id: 'verified-1', linear: 0, angular: 0 });
  assert.equal(a.frames.length, aStart + 1);
  assert.equal(b.frames.length, bStart);
  assert.equal(last(a).data.robot_id, 'verified-1');
  assert.equal(last(ui).data.outcome, 'SENT_UNCONFIRMED');
  const denied = await router.deliverRobotCommand({ data: {
    robotId: 'verified-1', command: 'CMD_TELEOP_DRIVE',
    params: { linear: 0.4, angular: 0 } } });
  assert.equal(denied.reason, 'DEVICE_AUTH_UNAVAILABLE');
  const missingTarget = await router.deliverRobotCommand({ data: {
    command: 'CMD_TELEOP_DRIVE', params: { linear: 0, angular: 0 } } });
  assert.equal(missingTarget.reason, 'ROBOT_ID_REQUIRED');
  const stopViaInternal = await router.deliverRobotCommand({ data: {
    robotId: 'verified-2', command: 'CMD_TELEOP_DRIVE',
    params: { linear: 0, angular: 0 } } });
  assert.equal(stopViaInternal.reason, 'SENT_UNCONFIRMED');
  assert.equal(last(b).data.robot_id, 'verified-2');
  router.handleDisconnect(a); sessions.detach(a); a.readyState = 3;
  const reconnect = socket(); sessions.attach(reconnect);
  await frame(reconnect, 'SI', { type: 'ROBOT', robot_id: 'verified-1' });
  assert.equal(reconnect.frames.length, 1); // SI ACK only; no queued velocity.
  assert.equal(last(reconnect).data.authenticated, false);
  console.log('security-check: isolated routing assertions passed');
})().catch(e => { console.error(e); process.exitCode = 1; });
