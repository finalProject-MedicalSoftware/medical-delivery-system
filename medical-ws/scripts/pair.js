#!/usr/bin/env node
/**
 * Admin pairing tablet HMI (kontrak docs/api-contracts/robot-ws-tifa.md §3a).
 * Meminta ke gateway YANG SEDANG JALAN (kode hanya ada di memori proses gateway):
 *
 *   npm run pair -- TFUI5                 buat kode 6 digit (berlaku PAIRING_TTL_SEC)
 *   npm run pair -- TFUI5 --ws=ws://IP:8081/ws/v1/deliveries   + isi QR siap pindai
 *   npm run pair -- --list                daftar tablet terpasang
 *   npm run pair -- --revoke TFUI5        cabut tablet (sesi hidupnya ditutup 4002)
 *
 * Docker: docker exec <container> npm run pair -- TFUI5
 * Secret dari INTERNAL_PUBLISH_SECRET (.env), alamat gateway dari PAIR_GATEWAY_URL
 * (bawaan: loopback mesin ini + WS_PORT).
 */
const http = require('http');
const config = require('../src/config/env');

const args = process.argv.slice(2);
const flag = (name) => { const a = args.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : undefined; };
const positional = args.filter((a) => !a.startsWith('--'));
const base = new URL(process.env.PAIR_GATEWAY_URL || `http://127.0.0.1:${config.WS_PORT}`);

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : '';
    const req = http.request({
      host: base.hostname, port: base.port, path, method,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), 'x-internal-secret': config.INTERNAL_PUBLISH_SECRET }
    }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => { try { resolve({ status: res.statusCode, body: buf ? JSON.parse(buf) : null }); } catch { resolve({ status: res.statusCode, body: null }); } });
    });
    req.on('error', reject);
    req.end(payload);
  });
}

function fail(msg) { console.error(msg); process.exit(1); }

(async () => {
  if (!config.INTERNAL_PUBLISH_SECRET) fail('INTERNAL_PUBLISH_SECRET belum diisi (.env).');
  let r;
  try {
    if (args.includes('--list')) {
      r = await request('GET', '/internal/pairing');
      if (r.status !== 200) fail(`gagal (${r.status}): ${JSON.stringify(r.body)}`);
      if (!r.body.devices.length) return console.log('Belum ada tablet terpasang.');
      console.table(r.body.devices);
      return;
    }
    if (args.includes('--revoke')) {
      const uiId = positional[0];
      if (!uiId) fail('pakai: npm run pair -- --revoke <ui_id>');
      r = await request('DELETE', `/internal/pairing/${encodeURIComponent(uiId)}`);
      if (r.status !== 200) fail(`gagal (${r.status}): ${JSON.stringify(r.body)}`);
      console.log(r.body.revoked ? `Tablet ${uiId} dicabut${r.body.closed ? ' (sesi hidupnya ditutup)' : ''}.` : `Tidak ada tablet terpasang untuk ${uiId}.`);
      return;
    }
    const uiId = positional[0];
    if (!uiId) fail('pakai: npm run pair -- <ui_id> [--ws=ws://IP:PORT/PATH] | --list | --revoke <ui_id>');
    r = await request('POST', '/internal/pairing', { ui_id: uiId });
    if (r.status !== 201) fail(`gagal (${r.status}): ${JSON.stringify(r.body)}`);
    const { code, expires_at: exp } = r.body;
    console.log(`\n  Kode pairing ${uiId}:  ${code.slice(0, 3)} ${code.slice(3)}`);
    console.log(`  Berlaku sampai:       ${new Date(exp).toLocaleString('id-ID')}`);
    console.log('  Tablet: Mode Perawat → Pengaturan → Koneksi → Pasangkan, ketik kode ini.');
    const ws = flag('ws') || process.env.PUBLIC_WS_URL;
    if (ws) console.log(`  Isi QR (opsional):    ${JSON.stringify({ ws, ui_id: uiId, code })}`);
    console.log('');
  } catch (err) {
    fail(`gateway tidak terjangkau di ${base.origin} (${err.code || err.message}). Gateway sudah jalan?`);
  }
})();
