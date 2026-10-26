/**
 * Self-check (run: node scripts/check.js) — tanpa Kafka/WS/socket.
 * Menguji logika murni: validasi channel, pencocokan envelope, dedupe.
 */
const assert = require('assert');
const {
  parseChannel, channelKey, parseChannels,
  envelopeMatchesChannel, envelopeMatchesAny, isValidEnvelope
} = require('../src/core/channels');
const Dedupe = require('../src/core/dedupe');

// -- parseChannel ---------------------------------------------------------
assert.deepStrictEqual(parseChannel('all'), { kind: 'all' });
assert.deepStrictEqual(parseChannel('ward:A'), { kind: 'ward', code: 'A' });
assert.deepStrictEqual(parseChannel('delivery:DELIV-20261018-0001'), { kind: 'delivery', code: 'DELIV-20261018-0001' });
assert.strictEqual(parseChannel('ward:'), null);
assert.strictEqual(parseChannel('rooms:A'), null);
assert.strictEqual(parseChannel(['all']), null);

// -- parseChannels (dedupe key + buang yang invalid) ----------------------
assert.deepStrictEqual(parseChannels(
  ['all', 'ward:A', 'ward:B', 'all', 'bogus', 'delivery:D1', 'ward:A']
), ['all', 'ward:A', 'ward:B', 'delivery:D1']);
assert.deepStrictEqual(parseChannels([]), []);
assert.deepStrictEqual(parseChannels(null), []);

// -- envelopeMatchesChannel ----------------------------------------------
const env = {
  v: 1, eventId: 'e1', idempotencyKey: 'ik1',
  type: 'DELIVERY_STATUS_CHANGED', occurredAt: '2026-10-22T00:00:00.000Z',
  requestCode: 'DELIV-0001', wardCode: 'A',
  data: { from: 'PENDING_INTEGRATION', to: 'MOCK_IN_TRANSIT', statusLabel: '[MOCK] Transit' }
};
assert.ok(envelopeMatchesChannel(env, 'all'));
assert.ok(envelopeMatchesChannel(env, 'ward:A'));
assert.ok(!envelopeMatchesChannel(env, 'ward:B'));
assert.ok(envelopeMatchesChannel(env, 'delivery:DELIV-0001'));
assert.ok(!envelopeMatchesChannel(env, 'delivery:DELIV-0002'));
assert.ok(envelopeMatchesAny(env, parseChannels(['ward:A'])));
assert.ok(!envelopeMatchesAny(env, parseChannels(['ward:B'])));

// -- isValidEnvelope ------------------------------------------------------
assert.ok(isValidEnvelope(env));
assert.ok(!isValidEnvelope({ ...env, v: 2 }));
assert.ok(!isValidEnvelope({ ...env, eventId: '' }));
assert.ok(!isValidEnvelope({ ...env, data: undefined }));
assert.ok(!isValidEnvelope(null));

// -- Dedupe ---------------------------------------------------------------
let now = 1_000_000;
const d = new Dedupe(15 * 60 * 1000);
assert.strictEqual(d.seen('a', now), false); // pertama
assert.strictEqual(d.seen('a', now + 1000), true); // duplikat
assert.strictEqual(d.seen('a', now + 14 * 60 * 1000), true); // masih di TTL
now = now + 16 * 60 * 1000;
assert.strictEqual(d.seen('a', now), false); // sudah > TTL, boleh lagi
assert.strictEqual(d.seen('b', now), false);

console.log('✅ scripts/check.js — semua check lolos (channel, envelope, dedupe)');
