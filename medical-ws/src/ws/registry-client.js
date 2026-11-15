const config = require('../config/env');

// Registry status is administrative evidence, never device authentication.
async function lookup(robotId) {
  if (typeof robotId !== 'string' || !/^[A-Za-z0-9_.-]{3,64}$/.test(robotId) ||
      !config.REGISTRY_BACKEND_URL || !config.INTERNAL_PUBLISH_SECRET) {
    return { ok: false, reason: 'REGISTRY_UNAVAILABLE' };
  }
  try {
    const base = new URL(config.REGISTRY_BACKEND_URL);
    if (!['http:', 'https:'].includes(base.protocol)) throw new Error('invalid registry URL');
    const url = new URL('/internal/robots/' + encodeURIComponent(robotId) + '/eligibility', base);
    const res = await fetch(url, {
      headers: { 'X-Internal-Secret': config.INTERNAL_PUBLISH_SECRET },
      signal: AbortSignal.timeout(2000),
    });
    if (res.status === 404) return { ok: false, reason: 'UNKNOWN_ROBOT' };
    if (!res.ok) return { ok: false, reason: 'REGISTRY_UNAVAILABLE' };
    const data = await res.json();
    if (data.robotId !== robotId || data.eligible !== true ||
        data.registrationStatus !== 'VERIFIED') {
      return { ok: false, reason: 'ROBOT_NOT_ELIGIBLE' };
    }
    return { ok: true, registrationStatus: data.registrationStatus };
  } catch {
    return { ok: false, reason: 'REGISTRY_UNAVAILABLE' };
  }
}
module.exports = { lookup };
