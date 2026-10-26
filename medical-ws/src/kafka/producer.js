const { kafka, TOPICS, Partitioners } = require('./config');
const logger = require('../utils/logger');

/** Producer: hanya DLQ untuk pesan tidak-valid (envelope rusak). */
class KafkaProducerService {
  constructor() {
    this.producer = kafka.producer({
      createPartitioner: Partitioners.DefaultPartitioner,
      allowIdempotence: true
    });
    this.connected = false;
  }

  async connect() {
    if (this.connected) return;
    await this.producer.connect();
    this.connected = true;
    logger.info('[KafkaProducer] ✅ Connected');
  }

  async produceDlq(reason, rawMessage) {
    if (!this.connected) return; // DLQ best-effort; jangan blokir WS
    try {
      await this.producer.send({
        topic: TOPICS.SIMRS_DELIVERY_DLQ,
        messages: [{ key: null, value: rawMessage, headers: { dlqReason: reason } }]
      });
    } catch (err) {
      logger.error('[KafkaProducer] DLQ send failed:', err.message);
    }
  }
}

module.exports = new KafkaProducerService();
