// e2e manual: WS subscribe -> bridge publish -> expect 1 broadcast, lalu duplikat -> 400.
import WebSocket from 'ws';

const WS = process.env.E2E_WS ?? 'ws://127.0.0.1:8083/ws/v1/deliveries';
const HTTP = process.env.E2E_HTTP ?? 'http://127.0.0.1:8083';
const TOKEN = process.env.WS_AUTH_TOKEN;
const SECRET = process.env.INTERNAL_PUBLISH_SECRET;
if (!TOKEN || !SECRET) {
  console.error('Set WS_AUTH_TOKEN dan INTERNAL_PUBLISH_SECRET dari medical-ws/.env (export/source) sebelum menjalankan e2e.');
  process.exit(2);
}

const envelope = {
  v: 1,
  eventId: `e2e-${Date.now()}`,
  type: 'DELIVERY_REQUESTED',
  occurredAt: new Date().toISOString(),
  requestCode: 'E2E-0001',
  wardCode: 'WARD-A',
  data: { note: '[MOCK] e2e' },
};

const frames = [];
const ws = new WebSocket(WS, { headers: { Authorization: `Bearer ${TOKEN}` } });

ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());
  frames.push(msg);
  console.log('WS <-', msg.type ?? msg.event?.type ?? 'unknown');
});
ws.on('close', (code) => console.log('WS closed', code));
ws.on('error', (e) => { console.error('WS error', e.message); process.exit(1); });

const post = (body) =>
  fetch(`${HTTP}/internal/publish`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-secret': SECRET },
    body: JSON.stringify(body),
  });

ws.on('open', async () => {
  ws.send(JSON.stringify({ action: 'subscribe', channels: ['all'] }));
  await new Promise((r) => setTimeout(r, 300));

  const r1 = await post(envelope);
  console.log('POST1', r1.status, await r1.text());
  await new Promise((r) => setTimeout(r, 500));

  const r2 = await post(envelope);
  console.log('POST2', r2.status, await r2.text());
  await new Promise((r) => setTimeout(r, 300));

  const broadcasts = frames.filter((f) => f.eventId === envelope.eventId || f.event?.eventId === envelope.eventId);
  console.log(`broadcast count = ${broadcasts.length}`);
  console.assert(r1.status === 202, 'POST1 harus 202');
  console.assert(r2.status === 400, 'POST2 harus 400 DUPLICATE');
  console.assert(broadcasts.length === 1, 'tepat 1 broadcast');
  ws.close();
  process.exit(0);
});
