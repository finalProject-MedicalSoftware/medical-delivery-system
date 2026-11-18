/** Self-check terjemahan frame robot (node scripts/frames-check.js). */
const assert = require('assert');
const { teleopVectors, uiFrame, commandFrames, BACKEND_EVENT_CODES } = require('../src/core/robot-frames');

const cfg = { maxLinear: 0.3, maxAngular: 0.6 };

// teleop: angka ternormalisasi -> vektor Twist berskala; dipotong ke batas
assert.deepStrictEqual(teleopVectors(1, -1, cfg), { linear: { x: 0.3, y: 0, z: 0 }, angular: { x: 0, y: 0, z: -0.6 } });
assert.deepStrictEqual(teleopVectors(5, 0, cfg).linear.x, 0.3);
assert.deepStrictEqual(teleopVectors(0, 0, cfg), { linear: { x: 0, y: 0, z: 0 }, angular: { x: 0, y: 0, z: 0 } });
assert.strictEqual(teleopVectors('1', 0, cfg), null);
assert.strictEqual(teleopVectors(NaN, 0, cfg), null);
// objek vektor diterima tetapi dipotong
assert.strictEqual(teleopVectors({ x: 9 }, { z: 9 }, cfg).linear.x, 0.3);
assert.strictEqual(teleopVectors({ x: 9 }, { z: 9 }, cfg).angular.z, 0.6);

// uiFrame: hanya TELEOP dikonversi; data lain (robot_id) dipertahankan
const t = uiFrame('TELEOP', { robot_id: 'TFRB5', linear: 1, angular: 0 }, cfg);
assert.strictEqual(t.data.robot_id, 'TFRB5');
assert.strictEqual(t.data.linear.x, 0.3);
assert.strictEqual(uiFrame('TELEOP', { linear: 'x', angular: 0 }, cfg), null);
assert.deepStrictEqual(uiFrame('MODE', { mode: 'IDLE' }, cfg), { code: 'MODE', data: { mode: 'IDLE' } });

// commandFrames
const dest = { x: 1.5, y: -2, yaw: 1.57 };
const op = commandFrames('CMD_DISPATCH_OP', { mapId: 3, trayTasks: [{ tray: 0, dest, goalId: 7 }, { tray: 1, dest }], homeBase: { x: 0, y: 0, yaw: 0 } }, 'TFRB5', 'c1', cfg);
assert.strictEqual(op.frames[0].code, 'OP');
assert.strictEqual(op.frames[0].data.tray_tasks.length, 2);
assert.strictEqual(op.frames[0].data.tray_tasks[0].goal_id, 7);
assert.strictEqual(op.frames[0].data.map_id, '3');
assert.deepStrictEqual(op.frames[0].data.home_base, { x: 0, y: 0, yaw: 0 });
assert.strictEqual(op.frames[0].data.robot_id, 'TFRB5');
assert.strictEqual(commandFrames('CMD_DISPATCH_OP', { trayTasks: [] }, 'TFRB5', 'c', cfg).error, 'INVALID_PARAMS');
assert.strictEqual(commandFrames('CMD_DISPATCH_OP', { trayTasks: [{ tray: 0, dest: { x: 1, y: 1, yaw: NaN } }] }, 'TFRB5', 'c', cfg).error, 'INVALID_PARAMS');
assert.strictEqual(commandFrames('CMD_DISPATCH_OP', { trayTasks: [{ tray: 0, dest: { x: 5000, y: 1, yaw: 0 } }] }, 'TFRB5', 'c', cfg).error, 'INVALID_PARAMS');

const dock = commandFrames('CMD_RETURN_TO_DOCK', { dest }, 'TFRB5', 'c2', cfg);
assert.deepStrictEqual([dock.frames[0].code, dock.frames[0].data.type, dock.frames[0].data.sequence], ['MOVE', 'HOMEBASE', -1]);
assert.strictEqual(commandFrames('CMD_RETURN_TO_DOCK', {}, 'TFRB5', 'c', cfg).error, 'INVALID_PARAMS');

assert.deepStrictEqual(commandFrames('CMD_CANCEL_MISSION', {}, 'TFRB5', 'c3', cfg).frames.map((f) => f.code), ['INTERRUPT', 'INTERRUPT_CONFIRM']);
assert.strictEqual(commandFrames('CMD_PICKUP_CONFIRM', { sequence: 2 }, 'TFRB5', 'c4', cfg).frames[0].data.sequence, 2);
assert.strictEqual(commandFrames('CMD_PICKUP_CONFIRM', {}, 'TFRB5', 'c', cfg).error, 'INVALID_PARAMS');
assert.strictEqual(commandFrames('CMD_SET_SPEED', { speed: 1 }, 'TFRB5', 'c', cfg).error, 'CODE_NOT_ALLOWED');
assert.strictEqual(commandFrames('CMD_UNKNOWN', {}, 'TFRB5', 'c', cfg).error, 'CODE_NOT_ALLOWED');

assert.ok(BACKEND_EVENT_CODES.has('GOAL_COMPLETE') && !BACKEND_EVENT_CODES.has('POSITION'));
console.log('frames-check OK');
