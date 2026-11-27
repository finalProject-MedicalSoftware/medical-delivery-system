/**
 * Self-check pairing tablet HMI (kontrak docs/api-contracts/robot-ws-tifa.md §3a).
 * Jalankan: node scripts/pairing-check.js — server nyata di port 8098, Kafka distub,
 * DEVICES_FILE di folder sementara (dihapus di akhir).
 */
const os = require('os');
const fs = require('fs');
const path = require('path');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pairing-check-'));
process.env.WS_PORT = '8098';
process.env.KAFKA_ENABLED = 'false';
process.env.WS_AUTH_TOKEN = 'pairing-shared-token';
process.env.INTERNAL_PUBLISH_SECRET = 'pairing-secret';
process.env.DEVICES_FILE = path.join(tmp, 'devices.json');
process.env.LOG_LEVEL = 'error';

const assert = require('assert');
const http = require('http');
const WebSocket = require('ws');
const kafkaProducer = require('../src/kafka/producer');
kafkaProducer.connected = true;
kafkaProducer.produce = async () => {};
const serverModule = require('../src/ws/server');
const { DeviceRegistry } = require('../src/core/devices');

const PORT = 8098, SECRET = 'pairing-secret', SHARED = 'pairing-shared-token';
const URL = `ws://127.0.0.1:${PORT}/ws/v1/deliveries`;
const INST_A = 'tablet-instance-aaaa', INST_B = 'tablet-instance-bbbb';

function http_(method, p, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? '' : JSON.stringify(body);
    const req = http.request({ host: '127.0.0.1', port: PORT, path: p, method, headers: { 'Content-Type': 'application/json', ...headers } }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: buf ? JSON.parse(buf) : null }));
    });
    req.on('error', reject);
    req.end(payload);
  });
}
const admin = { 'x-internal-secret': SECRET };
const newCode = async (ui) => (await http_('POST', '/internal/pairing', { ui_id: ui }, admin)).body.code;

/** Socket dengan antrean frame {code,data} + penanda close. */
function client() {
  return new Promise((resolve) => {
    const ws = new WebSocket(URL);
    const c = { ws, frames: [], waiters: [], closed: null };
    ws.on('message', (raw) => {
      let m; try { m = JSON.parse(raw.toString()); } catch { return; }
      if (!m || !('code' in m)) return;
      const i = c.waiters.findIndex((w) => w.pred(m));
      if (i >= 0) { const [w] = c.waiters.splice(i, 1); clearTimeout(w.t); w.resolve(m); } else c.frames.push(m);
    });
    ws.on('close', (code) => { c.closed = code; (c.onClose || (() => {}))(code); });
    c.next = (pred, label) => new Promise((res, rej) => {
      const i = c.frames.findIndex(pred);
      if (i >= 0) return res(c.frames.splice(i, 1)[0]);
      const w = { pred, resolve: res, t: setTimeout(() => rej(new Error(`TIMEOUT ${label}`)), 3000) };
      c.waiters.push(w);
    });
    c.send = (code, data) => ws.send(JSON.stringify({ code, data }));
    c.waitClose = () => new Promise((res, rej) => {
      if (c.closed !== null) return res(c.closed);
      const t = setTimeout(() => rej(new Error('TIMEOUT close')), 3000);
      c.onClose = (code) => { clearTimeout(t); res(code); };
    });
    ws.on('open', () => resolve(c));
  });
}
const code = (k) => (m) => m.code === k;
const err = (e) => (m) => m.code === 'ERROR' && m.data && m.data.error === e;

let passed = 0;
const ok = (label) => { passed += 1; console.log(`  ✓ ${label}`); };

(async () => {
  await serverModule.start();

  // 1) Endpoint admin
  assert.strictEqual((await http_('POST', '/internal/pairing', { ui_id: 'TFUI5' })).status, 401);
  assert.strictEqual((await http_('POST', '/internal/pairing', { ui_id: 'bad id!' }, admin)).status, 400);
  let r = await http_('POST', '/internal/pairing', { ui_id: 'TFUI5' }, admin);
  assert.strictEqual(r.status, 201);
  assert.match(r.body.code, /^\d{6}$/);
  assert.ok(Date.parse(r.body.expires_at) > Date.now());
  ok('POST /internal/pairing: tanpa secret 401, ui_id tak valid 400, sah 201 kode 6 digit');

  // 2) PAIR salah -> PAIR_INVALID; benar -> PAIR_OK; dipakai ulang -> PAIR_INVALID
  let code1 = r.body.code;
  const wrong = String((Number(code1) + 1) % 1_000_000).padStart(6, '0');
  const P = await client();
  P.send('PAIR', { ui_id: 'TFUI5', code: wrong, instance_id: INST_A });
  await P.next(err('PAIR_INVALID'), 'PAIR salah');
  P.send('PAIR', { ui_id: 'TFUI5', code: code1, instance_id: INST_A });
  let m = await P.next(code('PAIR_OK'), 'PAIR_OK');
  const tokenA = m.data.device_token;
  assert.match(tokenA, /^[A-Za-z0-9_-]{43}$/);
  P.send('PAIR', { ui_id: 'TFUI5', code: code1, instance_id: INST_A });
  await P.next(err('PAIR_INVALID'), 'kode dipakai ulang');
  ok('PAIR: salah -> PAIR_INVALID, benar -> PAIR_OK (token 43 char), kode sekali pakai');

  // 3) File perangkat hanya berisi hash
  const file = fs.readFileSync(process.env.DEVICES_FILE, 'utf8');
  assert.ok(!file.includes(tokenA), 'token mentah tidak boleh tersimpan');
  assert.match(JSON.parse(file).devices.TFUI5.token_sha256, /^[0-9a-f]{64}$/);
  assert.strictEqual((fs.statSync(process.env.DEVICES_FILE).mode & 0o777), 0o600);
  const list = (await http_('GET', '/internal/pairing', undefined, admin)).body.devices;
  assert.strictEqual(list.length, 1);
  assert.ok(!('token_sha256' in list[0]));
  ok('DEVICES_FILE hanya hash sha256 (mode 0600); GET daftar tanpa hash');

  // 4) SI token perangkat
  P.send('SI', { type: 'UI', ui_id: 'TFUI5', instance_id: INST_B, device_token: tokenA });
  await P.next(err('DEVICE_UNPAIRED'), 'instance salah');
  P.send('SI', { type: 'UI', ui_id: 'TFUI5', device_token: tokenA });
  await P.next(err('INVALID_SI'), 'tanpa instance');
  P.send('SI', { type: 'UI', ui_id: 'TFUI5', instance_id: INST_A, device_token: tokenA });
  m = await P.next(code('ACK_SOFT'), 'ACK device');
  assert.strictEqual(m.data.auth, 'device');
  ok('SI device_token: instance salah -> DEVICE_UNPAIRED, tanpa instance -> INVALID_SI, cocok -> ACK_SOFT auth=device');

  // 5) Tablet yang sama tersambung ulang saat sesi lama masih hidup -> lama ditutup 4001
  const P2 = await client();
  P2.send('SI', { type: 'UI', ui_id: 'TFUI5', instance_id: INST_A, device_token: tokenA });
  await P2.next(code('ACK_SOFT'), 'ACK reconnect');
  assert.strictEqual(await P.waitClose(), 4001);
  ok('instance sama -> sesi hantu diganti, sesi lama close 4001');

  // 6) Token bersama: instance beda -> DUPLICATE_UI_ID; force -> ambil alih (lama 4001)
  const D1 = await client(), D2 = await client();
  D1.send('SI', { type: 'UI', ui_id: 'dash', instance_id: INST_A, token: SHARED });
  m = await D1.next(code('ACK_SOFT'), 'ACK shared');
  assert.strictEqual(m.data.auth, 'shared');
  D2.send('SI', { type: 'UI', ui_id: 'dash', instance_id: INST_B, token: SHARED });
  await D2.next(err('DUPLICATE_UI_ID'), 'duplikat');
  D2.send('SI', { type: 'UI', ui_id: 'dash', instance_id: INST_B, token: SHARED, force: true });
  await D2.next(code('ACK_SOFT'), 'ACK force');
  assert.strictEqual(await D1.waitClose(), 4001);
  ok('token bersama: instance beda -> DUPLICATE_UI_ID; force -> ambil alih, lama close 4001');

  // 7) Batas percobaan: 5 salah -> kode gugur; 5 PAIR/menit per socket
  const code2 = await newCode('TFUI9');
  const bad2 = String((Number(code2) + 7) % 1_000_000).padStart(6, '0');
  const R1 = await client();
  for (let i = 0; i < 5; i++) { R1.send('PAIR', { ui_id: 'TFUI9', code: bad2, instance_id: INST_A }); await R1.next(err('PAIR_INVALID'), `salah ${i}`); }
  R1.send('PAIR', { ui_id: 'TFUI9', code: code2, instance_id: INST_A });
  await R1.next(err('PAIR_RATE_LIMITED'), 'rate limit socket');
  const R2 = await client();
  R2.send('PAIR', { ui_id: 'TFUI9', code: code2, instance_id: INST_A });
  await R2.next(err('PAIR_INVALID'), 'kode gugur setelah 5 salah');
  ok('5 salah -> kode gugur; PAIR ke-6 dalam 1 menit per socket -> PAIR_RATE_LIMITED');

  // 8) Pairing ulang dari tablet lain -> tablet lama dicabut (close 4002), token lama mati
  const code3 = await newCode('TFUI5');
  const N = await client();
  N.send('PAIR', { ui_id: 'TFUI5', code: code3, instance_id: INST_B });
  m = await N.next(code('PAIR_OK'), 'PAIR_OK tablet baru');
  const tokenB = m.data.device_token;
  assert.strictEqual(await P2.waitClose(), 4002);
  const O = await client();
  O.send('SI', { type: 'UI', ui_id: 'TFUI5', instance_id: INST_A, device_token: tokenA });
  await O.next(err('DEVICE_UNPAIRED'), 'token lama mati');
  ok('pairing ulang dari tablet lain -> sesi tablet lama close 4002, token lama DEVICE_UNPAIRED');

  // 9) UNPAIR dari tablet -> UNPAIR_OK + close 1000, token mati
  N.send('SI', { type: 'UI', ui_id: 'TFUI5', instance_id: INST_B, device_token: tokenB });
  await N.next(code('ACK_SOFT'), 'ACK tablet baru');
  N.send('UNPAIR', {});
  await N.next(code('UNPAIR_OK'), 'UNPAIR_OK');
  assert.strictEqual(await N.waitClose(), 1000);
  const N2 = await client();
  N2.send('SI', { type: 'UI', ui_id: 'TFUI5', instance_id: INST_B, device_token: tokenB });
  await N2.next(err('DEVICE_UNPAIRED'), 'token setelah UNPAIR');
  D2.send('UNPAIR', {});
  await D2.next(err('DEVICE_SESSION_REQUIRED'), 'UNPAIR dari sesi token bersama');
  ok('UNPAIR: tablet -> UNPAIR_OK close 1000, token mati; sesi token bersama ditolak');

  // 10) Cabut admin -> sesi hidup close 4002
  const code4 = await newCode('TFUI7');
  const T = await client();
  T.send('PAIR', { ui_id: 'TFUI7', code: code4, instance_id: INST_A });
  const tokenT = (await T.next(code('PAIR_OK'), 'PAIR TFUI7')).data.device_token;
  T.send('SI', { type: 'UI', ui_id: 'TFUI7', instance_id: INST_A, device_token: tokenT });
  await T.next(code('ACK_SOFT'), 'ACK TFUI7');
  r = await http_('DELETE', '/internal/pairing/TFUI7', undefined, admin);
  assert.deepStrictEqual(r.body, { revoked: true, closed: true });
  assert.strictEqual(await T.waitClose(), 4002);
  assert.deepStrictEqual((await http_('DELETE', '/internal/pairing/TFUI7', undefined, admin)).body, { revoked: false, closed: false });
  ok('DELETE /internal/pairing/<ui_id> -> dicabut + sesi hidup close 4002; ulang -> revoked:false');

  // 11) Kedaluwarsa (unit, jam diinjeksi) + muat ulang dari file
  let now = 1_000_000;
  const reg = new DeviceRegistry({ file: path.join(tmp, 'unit.json'), ttlMs: 600_000, now: () => now });
  const c = reg.createCode('U1').code;
  now += 600_001;
  assert.strictEqual(reg.redeem('U1', c, INST_A).ok, false);
  const c2 = reg.createCode('U1').code;
  const t2 = reg.redeem('U1', c2, INST_A).device_token;
  const reg2 = new DeviceRegistry({ file: path.join(tmp, 'unit.json') });
  assert.strictEqual(reg2.verify('U1', INST_A, t2), true);
  assert.strictEqual(reg2.verify('U1', INST_A, t2.slice(0, -1) + (t2.endsWith('A') ? 'B' : 'A')), false);
  ok('kode lewat TTL -> PAIR_INVALID; token perangkat tetap sah setelah gateway restart (muat ulang file)');

  console.log(`\nSemua ${passed} asersi pairing-check LULUS ✅\n`);
  fs.rmSync(tmp, { recursive: true, force: true });
  serverModule.stop();
  process.exit(0);
})().catch((e) => {
  console.error('\n✗ pairing-check GAGAL:', e && e.stack ? e.stack : e);
  fs.rmSync(tmp, { recursive: true, force: true });
  serverModule.stop();
  process.exit(1);
});
