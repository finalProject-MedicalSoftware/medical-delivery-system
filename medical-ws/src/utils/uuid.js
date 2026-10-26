const { v4: uuidv4 } = require('uuid');

function generateEventId() {
  return uuidv4();
}

module.exports = { generateEventId };
