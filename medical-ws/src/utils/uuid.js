const { v4: uuidv4 } = require('uuid');

function generateEventId() {
  return uuidv4();
}

function generateMessageId() {
  return uuidv4();
}

module.exports = { generateEventId, generateMessageId };
