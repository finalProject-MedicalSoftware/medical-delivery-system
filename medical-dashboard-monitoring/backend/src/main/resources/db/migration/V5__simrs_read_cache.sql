CREATE TABLE IF NOT EXISTS simrs_active_delivery_cache (
    request_code VARCHAR(160) PRIMARY KEY,
    payload JSONB NOT NULL,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS simrs_snapshot_cache (
    id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
    payload JSONB NOT NULL,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
