const { kafka, TOPICS } = require('./config');
const logger = require('../utils/logger');

/**
 * Consumer topik `simrs.delivery.events.v1`.
 * Tidak subscribed: hanya topik delivery. Tidak boleh berlangganan
 * `simrs.robot.events.v1` sebelum NEVO/integrasi nyata (kontrak 3.3).
 */
class KafkaConsumerService {
  constructor({ onEvent }) {
    this.consumer = kafka.consumer({
      groupId: process.env.KAFKA_GROUP_ID || 'medical-ws-group',
      sessionTimeout: 30000,
      heartbeatInterval: 3000
    });
    this.onEvent = onEvent;
    this.connected = false;
  }

  async start() {
    await this.consumer.connect();
    await this.consumer.subscribe({ topic: TOPICS.SIMRS_DELIVERY_EVENTS, fromBeginning: false });
    await this.consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        const raw = message.value ? message.value.toString() : '';
        logger.debug('[KafkaConsumer] message:', topic, partition, raw);
        try {
          await this.onEvent(raw);
        } catch (err) {
          // Handler tidak boleh mematikan loop konsumsi.
          logger.error('[KafkaConsumer] handler error:', err.message);
        }
      }
    });
    this.connected = true;
    logger.info('[KafkaConsumer] ✅ Subscribed:', TOPICS.SIMRS_DELIVERY_EVENTS);
  }

  async stop() {
    if (this.connected) await this.consumer.disconnect().catch(() => {});
    this.connected = false;
  }
}

module.exports = KafkaConsumerService;
