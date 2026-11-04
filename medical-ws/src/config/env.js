require('dotenv').config();

module.exports = {
  WS_PORT: parseInt(process.env.WS_PORT || '8081', 10),
  WS_PATH: process.env.WS_PATH || '/ws/v1/deliveries',
  // Token auth SI UI (di dalam sesi, bukan di upgrade). Kosong = semua SI UI ditolak.
  // Robot SI tidak butuh token. Juga dipakai Bearer legacy di upgrade (server.js).
  WS_AUTH_TOKEN: process.env.WS_AUTH_TOKEN || '',
  // Secret bridge HTTP backend -> WS (POST /internal/publish). Kosong = endpoint ditolak (401).
  INTERNAL_PUBLISH_SECRET: process.env.INTERNAL_PUBLISH_SECRET || '',
  INTERNAL_PUBLISH_MAX_BYTES: parseInt(process.env.INTERNAL_PUBLISH_MAX_BYTES || '65536', 10),
  // Fase bridge HTTP: tanpa broker Kafka. Set true setelah broker hidup.
  KAFKA_ENABLED: process.env.KAFKA_ENABLED === 'true',
  KAFKA_BROKERS: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
  KAFKA_CLIENT_ID: process.env.KAFKA_CLIENT_ID || 'medical-ws',
  KAFKA_GROUP_ID: process.env.KAFKA_GROUP_ID || 'medical-ws-group',
  TOPIC_EVENTS: process.env.TOPIC_EVENTS || 'simrs.delivery.events.v1',
  TOPIC_DLQ: process.env.TOPIC_DLQ || 'simrs.delivery.events.dlq',
  // Telemetri robot protokol TIFA (uplink {code,data} dari sesi SI ROBOT).
  TOPIC_ROBOT_EVENTS: process.env.TOPIC_ROBOT_EVENTS || 'simrs.robot.events.v1',
  DEDUPE_TTL_MS: parseInt(process.env.DEDUPE_TTL_MS || '900000', 10), // 15 menit (kontrak 2.4)
  PING_INTERVAL_MS: parseInt(process.env.PING_INTERVAL_MS || '15000', 10),
  PONG_TIMEOUT_MS: parseInt(process.env.PONG_TIMEOUT_MS || '15000', 10),
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  NODE_ENV: process.env.NODE_ENV || 'development'
};
