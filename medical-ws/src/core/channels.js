/**
 * Validasi & pencocokan channel langganan (kontrak ws v1):
 *   all | ward:<wardCode> | delivery:<requestCode>
 */

const WARD_RE = /^ward:([A-Za-z0-9_-]+)$/;
const DELIVERY_RE = /^delivery:([A-Za-z0-9:_-]+)$/;

function parseChannel(raw) {
  if (typeof raw !== 'string') return null;
  if (raw === 'all') return { kind: 'all' };
  let m = raw.match(WARD_RE);
  if (m) return { kind: 'ward', code: m[1] };
  m = raw.match(DELIVERY_RE);
  if (m) return { kind: 'delivery', code: m[1] };
  return null;
}

function channelKey(ch) {
  return ch.kind === 'all' ? 'all' : `${ch.kind}:${ch.code}`;
}

/** Ubah array channel mentah dari klien menjadi daftar key unik yang valid. */
function parseChannels(list) {
  if (!Array.isArray(list) || list.length === 0) return [];
  const out = new Set();
  for (const raw of list) {
    const ch = parseChannel(raw);
    if (ch) out.add(channelKey(ch));
  }
  return [...out];
}

/** Cocokkan envelope event (v1) dengan key channel. */
function envelopeMatchesChannel(envelope, key) {
  if (key === 'all') return true;
  if (key.startsWith('ward:')) return envelope.wardCode === key.slice(5);
  if (key.startsWith('delivery:')) return envelope.requestCode === key.slice(9);
  return false;
}

function envelopeMatchesAny(envelope, channelKeys) {
  for (const key of channelKeys) {
    if (envelopeMatchesChannel(envelope, key)) return true;
  }
  return false;
}

/** Validasi bentuk minimal envelope v1 (struktur tunggal WS + Kafka). */
function isValidEnvelope(e) {
  return (
    !!e &&
    e.v === 1 &&
    typeof e.eventId === 'string' && e.eventId.length > 0 &&
    typeof e.type === 'string' && e.type.length > 0 &&
    typeof e.occurredAt === 'string' && e.occurredAt.length > 0 &&
    typeof e.requestCode === 'string' && e.requestCode.length > 0 &&
    typeof e.wardCode === 'string' && e.wardCode.length > 0 &&
    typeof e.data === 'object' && e.data !== null
  );
}

module.exports = {
  parseChannel,
  channelKey,
  parseChannels,
  envelopeMatchesChannel,
  envelopeMatchesAny,
  isValidEnvelope
};
