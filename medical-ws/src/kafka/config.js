const { Kafka, Partitioners, logLevel: KafkaLogLevel } = require('kafkajs');
const config = require('../config/env');
const logger = require('../utils/logger');

/**
 * Kafka client & topology (kontrak Bagian 3):
 * - `simrs.delivery.events.v1` : semua tipe event Envelope v1, key = requestCode
 * - `simrs.delivery.events.dlq`: pesan gagal format/validasi
 * - consumer group `<name>` — kita pakai `medical-ws-group`
 * - `simrs.robot.events.v1`  : uplink TIFA robot (STATUS/ACK/POSITION/dll.), key = robot_id
 * - `simrs.delivery.events.dlq`: pesan gagal format/validasi
 * - consumer group `<name>` — kita pakai `medical-ws-group`
 * - semantics at-least-once; order per-pengantaran dijamin via key, lintas pengantaran tidak.
 */

const TOPICS = {
  SIMRS_DELIVERY_EVENTS: config.TOPIC_EVENTS,
  SIMRS_ROBOT_EVENTS: config.TOPIC_ROBOT_EVENTS,
  SIMRS_DELIVERY_DLQ: config.TOPIC_DLQ
};

const kafka = new Kafka({
  clientId: config.KAFKA_CLIENT_ID,
  brokers: config.KAFKA_BROKERS,
  retry: {
    retries: 10,
    initialRetryTime: 500
  },
  logLevel: config.LOG_LEVEL === 'debug' ? KafkaLogLevel.DEBUG : KafkaLogLevel.NOTHING
});

logger.debug('[KafkaConfig] brokers:', config.KAFKA_BROKERS, 'topics:', TOPICS);

module.exports = { kafka, TOPICS, Partitioners };
