/**
 * Self-check jalur robot TIFA (kontrak docs/api-contracts/robot-ws-tifa.md).
 * Jalankan: WS_PORT=8099 node scripts/tifa-selfcheck.js
 * Stub producer Kafka di-proc; server nyata di-start di port ephemeral.
 */
process.env.WS_PORT = process.env.WS_PORT || '8099';
process.env.KAFKA_ENABLED = 'false';
// HARUS sebelum require env.js (dotenv tidak menimpa process.env yang sudah ada).
process.env.WS_AUTH_TOKEN = 'selfcheck-token';
process.env.INTERNAL_PUBLISH_SECRET = 'selfcheck-secret';

const assert = require('assert');
const WebSocket = require('ws');
const kafkaProducer = require('../src/kafka/producer');
const serverModule = require('../src/ws/server');

const produced = [];
kafkaProducer.connected = true; // stub: tangkap produce() tanpa broker
kafkaProducer.produce = async (topic, value, key) => {
  produced.push({ topic, value, key });
};

const TOKEN = 'selfcheck-token';

function waitClose(ws) {
  return new Promise((r) => ws.on('close', (code) => r(code)));
}
function next(ws) {
  return new Promise((resolve, reject) => {
    ws.once('message', (m) => resolve(JSON.parse(m.toString())));
    ws.once('close', (code) => reject(new Error(`socket tertutup ${code} saat menunggu frame`)));
  });
}

async function main() {
  const step = (s) => console.error(`  [step] ${s}`);
  setTimeout(() => { console.error('❌ TIMEOUT'); process.exit(2); }, 10000).unref();
  step('start server');
  await serverModule.start();
  const url = `ws://localhost:${process.env.WS_PORT}/ws/v1/deliveries`;

  // 1. tanpa token -> close 4401
  const bad = new WebSocket(url);
  const badCode = await waitClose(bad);
  step('1 close-4401');
  assert.strictEqual(badCode, 4401, 'tanpa token harus close 4401');

  // 2. sesi UI subscribe robot:nevo-01
  const ui = new WebSocket(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  assert.strictEqual((await next(ui)).type, 'SNAPSHOT_REQUIRED');
  ui.send(JSON.stringify({ action: 'subscribe', channels: ['robot:nevo-01'] }));
  assert.deepStrictEqual(await next(ui), { type: 'SUBSCRIBED', channels: ['robot:nevo-01'] });
  step('2 ui-subscribe');

  // 3. robot SI duplikat ditolak SEBELUM robot pertama ada? urutan: SI pertama dulu.
  const robot = new WebSocket(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  await next(robot); // SNAPSHOT_REQUIRED (abaikan bila tidak ada)
  robot.on('message', (m) => {
    const f = JSON.parse(m.toString());
    if (f.type) return; // frame UI jalur lama, bukan TIFA
  });
  robot.send(JSON.stringify({ code: 'SI', data: { type: 'ROBOT', robot_id: 'nevo-01' } }));
  const ack = await next(robot);
  assert.strictEqual(ack.code, 'ACK_SOFT');
  assert.strictEqual(ack.data.robot_id, 'nevo-01');
  step('3 si-ack-soft');

  // 4. SI duplikat -> ERROR + close 4002
  const robot2 = new WebSocket(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  await next(robot2);
  robot2.send(JSON.stringify({ code: 'SI', data: { type: 'ROBOT', robot_id: 'nevo-01' } }));
  const dup = await next(robot2);
  assert.strictEqual(dup.code, 'ERROR');
  assert.strictEqual(dup.data.error, 'DUPLICATE');
  assert.strictEqual(await waitClose(robot2), 4002, 'duplikat harus close 4002');
  step('4 dup-4002');

  // 5. uplink tanpa SI -> NO_SESSION
  const ghost = new WebSocket(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  await next(ghost);
  ghost.send(JSON.stringify({ code: 'STATUS', data: { status: 'IDLE' } }));
  const noSess = await next(ghost);
  assert.strictEqual(noSess.code, 'ERROR');
  assert.strictEqual(noSess.data.error, 'NO_SESSION');
  ghost.close();
  step('5 no-session');

  // 6. uplink valid -> UI menerima frame terenrich + Kafka produce terpanggil
  robot.send(JSON.stringify({ code: 'STATUS', data: { status: 'MOVING', mission_code: 'DELIV-7' } }));
  const frame = await next(ui);
  assert.strictEqual(frame.code, 'STATUS');
  assert.strictEqual(frame.data.robot_id, 'nevo-01');
  assert.strictEqual(frame.data.status, 'MOVING');
  assert.ok(frame.data.timestamp, 'data.timestamp harus diisi server');
  assert.ok(frame.message_id, 'message_id harus diisi server');
  assert.strictEqual(produced.length, 1);
  assert.strictEqual(produced[0].topic, 'simrs.robot.events.v1');
  assert.strictEqual(produced[0].key, 'nevo-01');
  assert.strictEqual(produced[0].value.data.mission_code, 'DELIV-7');
  step('6 uplink-enrich-kafka');

  // 7. disconnect robot -> robot_id lepas -> SI ulang sukses
  robot.close();
  await new Promise((r) => setTimeout(r, 100));
  const robot3 = new WebSocket(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  await next(robot3);
  robot3.send(JSON.stringify({ code: 'SI', data: { type: 'ROBOT', robot_id: 'nevo-01' } }));
  assert.strictEqual((await next(robot3)).code, 'ACK_SOFT', 'SI ulang setelah disconnect harus sukses');
  step('7 resi-setelah-disconnect');

  // 8. GET /internal/robots -> daftar robot SI aktif
  const listRes = await fetch(`http://localhost:${process.env.WS_PORT}/internal/robots`, {
    headers: { 'x-internal-secret': process.env.INTERNAL_PUBLISH_SECRET },
  });
  assert.strictEqual(listRes.status, 200);
  assert.deepStrictEqual((await listRes.json()).robots, ['nevo-01']);
  step('8 list-robots');

  // 9. downlink ke robot terhubung -> frame ROBOT_COMMAND diterima robot, tidak ke topic delivery
  // Listener dipasang SEBELUM publish: server mengirim frame sinkron sebelum 202.
  const downlinkP = next(robot3);
  const cmdEnv = {
    v: 1, eventId: 'sc-cmd-1', type: 'ROBOT_COMMAND', occurredAt: new Date().toISOString(),
    requestCode: '', wardCode: '',
    data: { commandId: 'sc-cmdid-1', robotId: 'nevo-01', command: 'CMD_SET_SPEED', issuedBy: 'self', params: { speed: 1 } },
  };
  const r9 = await fetch(`http://localhost:${process.env.WS_PORT}/internal/publish`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-internal-secret': process.env.INTERNAL_PUBLISH_SECRET },
    body: JSON.stringify(cmdEnv),
  });
  assert.strictEqual(r9.status, 202);
  const downlink = await downlinkP;
  assert.strictEqual(downlink.code, 'ROBOT_COMMAND');
  assert.strictEqual(downlink.data.robotId, 'nevo-01');
  assert.strictEqual(downlink.data.command, 'CMD_SET_SPEED');
  assert.ok(produced.every((p) => p.topic !== 'simrs.delivery.events.v1'), 'downlink tidak boleh ke topic delivery');
  step('9 downlink-fwd');

  // 10. downlink ke robot tak dikenal -> uplink sintetis REJECTED/UNKNOWN_ROBOT
  const ghostEnv = { ...cmdEnv, eventId: 'sc-cmd-2', data: { ...cmdEnv.data, commandId: 'sc-cmdid-2', robotId: 'nevo-ghost' } };
  const r10 = await fetch(`http://localhost:${process.env.WS_PORT}/internal/publish`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-internal-secret': process.env.INTERNAL_PUBLISH_SECRET },
    body: JSON.stringify(ghostEnv),
  });
  assert.strictEqual(r10.status, 202);
  await new Promise((r) => setTimeout(r, 100));
  const last = produced[produced.length - 1];
  assert.strictEqual(last.topic, 'simrs.robot.events.v1');
  assert.strictEqual(last.value.code, 'ROBOT_COMMAND_RESULT');
  assert.strictEqual(last.value.data.robotId, 'nevo-ghost');
  assert.strictEqual(last.value.data.reason, 'UNKNOWN_ROBOT');
  step('10 unknown-robot-rejected');

  ui.close(); robot3.close();
  console.log('✅ semua assert TIFA lulus (%d produce Kafka tertangkap)', produced.length);
  process.exit(0);
}

process.env.WS_AUTH_TOKEN = TOKEN;
main().catch((err) => {
  console.error('❌ self-check gagal:', err.message);
  process.exit(1);
});
