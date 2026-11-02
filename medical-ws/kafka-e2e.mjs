// E2E jalur Kafka murni: produce langsung ke simrs.delivery.events.v1
// -> consumer medical-ws-group -> handleEnvelope -> broadcast ke WS.
import WebSocket from 'ws';
import { Kafka } from 'kafkajs';

const WS = process.env.E2E_WS ?? 'ws://127.0.0.1:8083/ws/v1/deliveries';
const BROKER = process.env.E2E_BROKER ?? '127.0.0.1:9093';
const TOPIC = 'simrs.delivery.events.v1';
const TOKEN = process.env.WS_AUTH_TOKEN;
if (!TOKEN) {
  console.error('Set WS_AUTH_TOKEN dari medical-ws/.env sebelum menjalankan kafka-e2e.');
  process.exit(2);
}

const eventId = `kafka-${Date.now()}`;
const requestCode = `KAFKA-${Date.now()}`;
const envelope = {
  v: 1,
  eventId,
  type: 'DELIVERY_REQUESTED',
  occurredAt: new Date().toISOString(),
  requestCode,
  wardCode: 'WARD-A',
  data: { note: '[MOCK] direct kafka path' },
};

const frames = [];
const ws = new WebSocket(WS, { headers: { Authorization: `Bearer ${TOKEN}` } });
ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());
  frames.push(msg);
  console.log('WS <-', msg.type ?? 'unknown');
});
ws.on('close', (code) => console.log('WS closed', code));
ws.on('error', (e) => { console.error('WS error', e.message); process.exit(1); });

ws.on('open', async () => {
  ws.send(JSON.stringify({ action: 'subscribe', channels: ['all'] }));
  await new Promise((r) => setTimeout(r, 300));

  // Produce langsung ke Kafka (host -> redpanda:9093).
  const kafka = new Kafka({ clientId: 'e2e-kafka-producer', brokers: [BROKER] });
  const producer = kafka.producer();
  await producer.connect();
  await producer.send({ topic: TOPIC, messages: [{ key: requestCode, value: JSON.stringify(envelope) }] });
  console.log('PRODUCED ->', TOPIC, eventId);
  await producer.disconnect();

  await new Promise((r) => setTimeout(r, 2000));

  const got = frames.some((f) => f.eventId === eventId);
  console.log(`kafka-path broadcast = ${got}`);
  ws.close();
  process.exit(got ? 0 : 1);
});