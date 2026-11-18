/**
 * Terjemahan perintah NEVO -> frame TIFA yang dimengerti robot (robot_api_node.cpp):
 *   TELEOP  data.linear.{x,y,z} + data.angular.{x,y,z}   (m/s, rad/s)
 *   MOVE    data.{type, sequence, dest{x,y,yaw}, home_base}
 *   OP      data.{type:'OP', tray_tasks[{tray,dest,goal_id}], home_base}
 *   PICKUP_CONFIRM data.sequence, INTERRUPT, INTERRUPT_CONFIRM
 * Fungsi murni (tanpa socket) supaya mudah diuji: scripts/frames-check.js.
 */

const MAX_TRAYS = 10;
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const clamp = (v, m) => Math.max(-m, Math.min(m, v));

function pose(p) {
  if (!p || !num(p.x) || !num(p.y) || !num(p.yaw) ||
      Math.abs(p.x) > 1000 || Math.abs(p.y) > 1000 || Math.abs(p.yaw) > 7) return null;
  return { x: p.x, y: p.y, yaw: p.yaw };
}

/**
 * UI mengirim kecepatan ternormalisasi (angka -1..1). Robot membaca vektor Twist.
 * Angka dikali batas kecepatan; objek vektor diterima juga tetapi dipotong ke batas.
 * Hasil `null` bila bentuknya tidak valid.
 */
function teleopVectors(linear, angular, cfg) {
  const L = cfg.maxLinear, A = cfg.maxAngular;
  if (num(linear) && num(angular)) {
    return {
      linear: { x: clamp(linear, 1) * L, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: clamp(angular, 1) * A },
    };
  }
  if (linear && angular && typeof linear === 'object' && typeof angular === 'object') {
    const get = (o, k) => (num(o[k]) ? o[k] : 0);
    return {
      linear: { x: clamp(get(linear, 'x'), L), y: clamp(get(linear, 'y'), L), z: 0 },
      angular: { x: 0, y: 0, z: clamp(get(angular, 'z'), A) },
    };
  }
  return null;
}

/** Frame UI->robot langsung (BFF /api/ws/command). TELEOP dikonversi; kode lain dilewatkan. */
function uiFrame(code, data, cfg) {
  if (code !== 'TELEOP') return { code, data };
  const v = teleopVectors(data.linear, data.angular, cfg);
  if (!v) return null;
  return { code, data: { ...data, ...v } };
}

/**
 * Perintah backend (ROBOT_COMMAND.data.command + params) -> daftar frame berurutan.
 * Mengembalikan {error} bila tidak dikenal/ params tidak valid.
 */
function commandFrames(command, params, robotId, commandId, cfg) {
  const p = params || {};
  const base = { robot_id: robotId, command_id: commandId };
  switch (command) {
    case 'CMD_TELEOP_DRIVE': {
      const v = teleopVectors(p.linear, p.angular, cfg);
      return v ? { frames: [{ code: 'TELEOP', data: { ...base, ...v } }] } : { error: 'INVALID_PARAMS' };
    }
    case 'CMD_RETURN_TO_DOCK': {
      const dest = pose(p.dest);
      if (!dest) return { error: 'INVALID_PARAMS' };
      return { frames: [{ code: 'MOVE', data: { ...base, type: 'HOMEBASE', sequence: -1, dest, home_base: dest } }] };
    }
    case 'CMD_CANCEL_MISSION':
      return { frames: [
        { code: 'INTERRUPT', data: { ...base } },
        { code: 'INTERRUPT_CONFIRM', data: { ...base } },
      ] };
    case 'CMD_DISPATCH_OP': {
      const tasks = Array.isArray(p.trayTasks) ? p.trayTasks : [];
      if (tasks.length < 1 || tasks.length > MAX_TRAYS) return { error: 'INVALID_PARAMS' };
      const trayTasks = [];
      for (const t of tasks) {
        const dest = pose(t && t.dest);
        if (!dest || !Number.isInteger(t.tray) || t.tray < 0) return { error: 'INVALID_PARAMS' };
        trayTasks.push({ tray: t.tray, dest, ...(Number.isInteger(t.goalId) ? { goal_id: t.goalId } : {}) });
      }
      const home = pose(p.homeBase);
      return { frames: [{ code: 'OP', data: {
        ...base, type: 'OP', ...(p.mapId != null ? { map_id: String(p.mapId) } : {}),
        tray_tasks: trayTasks, ...(home ? { home_base: home } : {}),
      } }] };
    }
    case 'CMD_PICKUP_CONFIRM':
      if (!Number.isInteger(p.sequence)) return { error: 'INVALID_PARAMS' };
      return { frames: [{ code: 'PICKUP_CONFIRM', data: { ...base, sequence: p.sequence } }] };
    default:
      return { error: 'CODE_NOT_ALLOWED' };
  }
}

/** Uplink robot yang diteruskan ke backend (status misi). */
const BACKEND_EVENT_CODES = new Set(['GOAL_COMPLETE', 'ACK', 'ERROR', 'ROBOT_STUCK', 'READY', 'PICKUP_CONFIRM', 'PHASE']);

module.exports = { teleopVectors, uiFrame, commandFrames, BACKEND_EVENT_CODES };
