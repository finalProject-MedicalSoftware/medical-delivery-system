/**
 * E2E tanpa Docker/robot (node scripts/motion-e2e.js): gateway nyata + stub registry/backend + robot palsu TFRB5.
 * Memeriksa: SI robot, teleop angka -> vektor Twist, perintah misi OP dari backend, uplink GOAL_COMPLETE
 * diteruskan ke backend, dan gate DEVICE_AUTH_UNAVAILABLE saat ALLOW_ROBOT_MOTION=false.
 */
const assert = require('assert');
const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const SECRET = 'e2e-secret', UI_TOKEN = 'e2e-ui-token', ROBOT = 'TFRB5';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const listen = (handler) => new Promise((res) => { const s = http.createServer(handler); s.listen(0, '127.0.0.1', () => res(s)); });

async function run(allowMotion) {
  const events = [];
  const registry = await listen((req, res) => {
    if (req.url === `/internal/robots/${ROBOT}/eligibility` && req.headers['x-internal-secret'] === SECRET) {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ robotId: ROBOT, registrationStatus: 'VERIFIED', eligible: true }));
    }
    if (req.url === '/internal/robot-events' && req.method === 'POST' && req.headers['x-internal-secret'] === SECRET) {
      let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { events.push(JSON.parse(b)); res.end('{}'); });
      return;
    }
    res.statusCode = 404; res.end();
  });
  const regUrl = `http://127.0.0.1:${registry.address().port}`;
  const port = 18000 + Math.floor(Math.random() * 1000);
  const gw = spawn(process.execPath, ['src/ws/server.js'], {
    cwd: __dirname + '/..',
    env: { ...process.env, WS_PORT: String(port), WS_AUTH_TOKEN: UI_TOKEN, INTERNAL_PUBLISH_SECRET: SECRET,
      REGISTRY_BACKEND_URL: regUrl, KAFKA_ENABLED: 'false', LOG_LEVEL: 'error', ALLOW_ROBOT_MOTION: String(allowMotion),
      TELEOP_MAX_LINEAR: '0.3', TELEOP_MAX_ANGULAR: '0.6' },
    stdio: 'ignore',
  });
  try {
    await sleep(800);
    const url = `ws://127.0.0.1:${port}/ws/v1/deliveries`;
    const robotFrames = [], uiFrames = [];
    const robot = new WebSocket(url);
    robot.on('message', (m) => robotFrames.push(JSON.parse(m)));
    await new Promise((r) => robot.on('open', r));
    robot.send(JSON.stringify({ code: 'SI', data: { type: 'ROBOT', robot_id: ROBOT } }));
    const ui = new WebSocket(url);
    ui.on('message', (m) => uiFrames.push(JSON.parse(m)));
    await new Promise((r) => ui.on('open', r));
    ui.send(JSON.stringify({ code: 'SI', data: { type: 'UI', ui_id: 'TFUI-E2E', token: UI_TOKEN } }));
    await sleep(600);
    assert.ok(robotFrames.some((f) => f.code === 'ACK_SOFT'), 'robot harus menerima ACK_SOFT');

    // 1) teleop dari UI (angka -1..1)
    ui.send(JSON.stringify({ code: 'TELEOP', data: { robot_id: ROBOT, linear: 1, angular: -1 } }));
    await sleep(400);
    const teleop = robotFrames.find((f) => f.code === 'TELEOP');
    if (allowMotion) {
      assert.ok(teleop, 'TELEOP harus sampai ke robot');
      assert.strictEqual(teleop.data.linear.x, 0.3);
      assert.strictEqual(teleop.data.angular.z, -0.6);
    } else {
      assert.ok(!teleop, 'gerak harus ditolak tanpa ALLOW_ROBOT_MOTION');
      assert.ok(uiFrames.some((f) => f.data && f.data.error === 'DEVICE_AUTH_UNAVAILABLE'));
    }

    // 2) stop nol selalu boleh dan berbentuk vektor nol
    robotFrames.length = 0;
    ui.send(JSON.stringify({ code: 'TELEOP', data: { robot_id: ROBOT, linear: 0, angular: 0 } }));
    await sleep(300);
    const stop = robotFrames.find((f) => f.code === 'TELEOP');
    assert.ok(stop && stop.data.linear.x === 0 && stop.data.angular.z === 0, 'stop nol harus sampai');

    // 3) perintah misi dari backend (bridge HTTP)
    robotFrames.length = 0;
    const publish = (data) => fetch(`http://127.0.0.1:${port}/internal/publish`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': SECRET },
      body: JSON.stringify({ v: 1, eventId: require('crypto').randomUUID(), type: 'ROBOT_COMMAND', occurredAt: new Date().toISOString(),
        requestCode: '', wardCode: '', data }),
    });
    const op = await publish({ commandId: 'c-op', robotId: ROBOT, command: 'CMD_DISPATCH_OP', params: {
      trayTasks: [{ tray: 0, dest: { x: 1, y: 2, yaw: 0 }, goalId: 1 }, { tray: 1, dest: { x: 3, y: 4, yaw: 1.57 }, goalId: 2 }], homeBase: { x: 0, y: 0, yaw: 0 } } });
    await sleep(400);
    if (allowMotion) {
      assert.strictEqual(op.status, 202);
      const opFrame = robotFrames.find((f) => f.code === 'OP');
      assert.ok(opFrame, 'OP harus sampai ke robot');
      assert.strictEqual(opFrame.data.tray_tasks.length, 2);
      assert.deepStrictEqual(opFrame.data.home_base, { x: 0, y: 0, yaw: 0 });
    } else {
      assert.strictEqual(op.status, 409, 'misi harus ditolak tanpa ALLOW_ROBOT_MOTION');
    }

    // 4) uplink robot -> diteruskan ke backend
    robot.send(JSON.stringify({ code: 'ACK', data: { robot_id: ROBOT, ui_id: 'TFUI5', command_id: 'OP', status: 'ENQUEUED' } }));
    robot.send(JSON.stringify({ code: 'GOAL_COMPLETE', data: { robot_id: ROBOT, ui_id: 'TFUI5', sequence: 1 } }));
    robot.send(JSON.stringify({ code: 'POSITION', data: { robot_id: ROBOT, x: 1, y: 2, yaw: 0 } }));
    await sleep(600);
    const codes = events.map((e) => e.code);
    assert.ok(codes.includes('ACK') && codes.includes('GOAL_COMPLETE'), 'ACK dan GOAL_COMPLETE harus diteruskan ke backend');
    assert.ok(!codes.includes('POSITION'), 'POSITION tidak boleh membanjiri backend');
    assert.strictEqual(events.find((e) => e.code === 'GOAL_COMPLETE').data.sequence, 1);
    robot.close(); ui.close();
  } finally {
    gw.kill();
    registry.close();
  }
}

(async () => {
  await run(true);
  console.log('motion-e2e (ALLOW_ROBOT_MOTION=true) OK');
  await run(false);
  console.log('motion-e2e (ALLOW_ROBOT_MOTION=false) OK');
})().catch((e) => { console.error('motion-e2e GAGAL:', e.message); process.exit(1); });
