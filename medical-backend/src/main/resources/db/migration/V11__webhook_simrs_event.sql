-- V11: tabel penerimaan webhook SIMRS (F2 outbox receiver).
CREATE TABLE IF NOT EXISTS h_webhook_simrs_event (
    id              BIGSERIAL PRIMARY KEY,
    event_id        UUID UNIQUE NOT NULL,          -- dedupe utama
    idempotency_key TEXT UNIQUE,                   -- (requestCode:from:to) opsional
    type            TEXT NOT NULL,                 -- DELIVERY_CREATED/CHANGED/ARRIVED/HANDOVER/CANCELLED
    occurred_at     TIMESTAMPTZ,
    request_code    TEXT,
    payload         JSONB NOT NULL,
    received_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_h_webhook_simrs_received ON h_webhook_simrs_event (received_at DESC);
CREATE INDEX IF NOT EXISTS idx_h_webhook_simrs_type ON h_webhook_simrs_event (type);
