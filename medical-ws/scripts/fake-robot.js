/**
 * Robot palsu untuk uji rantai penuh TANPA robot fisik (node scripts/fake-robot.js).
 * Meniru perilaku robot_api_node: SI ROBOT -> READY, balas OP dengan ACK ENQUEUED,
 * "berjalan" ke tiap tray_task lalu GOAL_COMPLETE, menunggu PICKUP_CONFIRM (atau auto), TELEOP/INTERRUPT dicetak.
 *
 * Env: WS_URL (ws://127.0.0.1:8083/ws/v1/deliveries)  ROBOT_ID (TFRB5)  UI_ID (TFUI5)
 *      TRAVEL_MS (6000)  AUTO_PICKUP_MS (8000; 0 = tunggu PICKUP_CONFIRM sungguhan)
 * Jangan jalankan bersamaan dengan robot fisik ber-ID sama (DUPLICATE_ROBOT_ID).
 */
const WebSocket = require('ws');

const URL_ = process.env.WS_URL || 'ws://127.0.0.1:8083/ws/v1/deliveries';
const ROBOT = process.env.ROBOT_ID || 'TFRB5';
const UI = process.env.UI_ID || 'TFUI5';
const TRAVEL_MS = Number(process.env.TRAVEL_MS || 6000);
const AUTO_PICKUP_MS = Number(process.env.AUTO_PICKUP_MS ?? 8000);

const ws = new WebSocket(URL_);
const out = (code, data) => { const f = { code, data: { robot_id: ROBOT, ui_id: UI, ...data } }; ws.send(JSON.stringify(f)); console.log('->', JSON.stringify(f)); };
let mode = 'IDLE', pose = { x: 0, y: 0, yaw: 0 }, queue = [], current = null;

function next() {
  current = queue.shift();
  if (!current) { mode = 'IDLE'; return; }
  mode = 'MOVING';
  const seq = current.seq;
  console.log(`[robot] menuju tray_task ${seq} ${JSON.stringify(current.dest)} (${TRAVEL_MS} ms)`);
  setTimeout(() => {
    pose = { ...current.dest };
    out('GOAL_COMPLETE', { sequence: seq });
    mode = 'PAUSED'; // menunggu PICKUP_CONFIRM manusia
    if (AUTO_PICKUP_MS > 0) setTimeout(() => pickup(seq), AUTO_PICKUP_MS);
  }, TRAVEL_MS);
}
function pickup(seq) {
  if (mode !== 'PAUSED') return;
  console.log(`[robot] PICKUP_CONFIRM seq=${seq}`);
  next();
}

ws.on('open', () => { ws.send(JSON.stringify({ code: 'SI', data: { type: 'ROBOT', robot_id: ROBOT } })); console.log(`[robot] SI ${ROBOT} -> ${URL_}`); });
ws.on('message', (raw) => {
  let m; try { m = JSON.parse(raw.toString()); } catch { return; }
  console.log('<-', JSON.stringify(m));
  if (m.code === 'ACK_SOFT') { out('READY', { mode: 'NAV', ready: true }); return; }
  if (m.code === 'OP') {
    if (mode !== 'IDLE') return out('ERROR', { error_code: 'MOTOR_FAIL', error_message: 'OP rejected: robot not IDLE', severity: 'MEDIUM' });
    queue = (m.data.tray_tasks || []).map((t, i) => ({ seq: i + 1, dest: t.dest }));
    out('ACK', { command_id: 'OP', status: 'ENQUEUED' });
    next();
  } else if (m.code === 'PICKUP_CONFIRM') pickup(m.data.sequence);
  else if (m.code === 'INTERRUPT') { mode = 'INTERRUPTED'; queue = []; out('ACK', { command_id: 'INTERRUPT', status: 'ACCEPTED' }); }
  else if (m.code === 'INTERRUPT_CONFIRM') { mode = 'IDLE'; }
  else if (m.code === 'MOVE') { mode = 'IDLE'; pose = { ...m.data.dest }; }
});
setInterval(() => { if (ws.readyState === WebSocket.OPEN) out('POSITION', { ...pose, mode }); }, 2000);
ws.on('close', () => { console.log('[robot] koneksi ditutup'); process.exit(0); });
ws.on('error', (e) => { console.error('[robot] error:', e.message); process.exit(1); });
