const logger = require('../utils/logger');
const { parseChannels } = require('../core/channels');
const sessionManager = require('./session-manager');

function send(socket, payload) {
  if (socket.readyState !== socket.OPEN) return;
  socket.send(JSON.stringify(payload));
}

function sendError(socket, code, detail) {
  send(socket, { type: 'ERROR', code, detail });
}

/**
 * Router pesan masuk (client -> server):
 * { action: "subscribe", channels: ["all","ward:A","delivery:DELIV-..."] }
 */
async function handleIncoming(socket, rawData) {
  let msg;
  try {
    msg = JSON.parse(rawData.toString());
  } catch {
    sendError(socket, 'INVALID_JSON', 'message is not valid JSON');
    return;
  }

  switch (msg && msg.action) {
    case 'subscribe': {
      const keys = parseChannels(msg.channels);
      if (keys.length === 0) {
        sendError(socket, 'NO_VALID_CHANNEL', 'allowed: all | ward:<wardCode> | delivery:<requestCode>');
        return;
      }
      sessionManager.setChannels(socket, keys);
      send(socket, { type: 'SUBSCRIBED', channels: keys });
      logger.debug('[Router] subscribed channels:', keys);
      break;
    }
    default:
      sendError(socket, 'UNKNOWN_ACTION', 'available actions: subscribe');
  }
}

module.exports = { handleIncoming, sendError, send };
