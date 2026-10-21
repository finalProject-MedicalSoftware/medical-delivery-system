CREATE TABLE IF NOT EXISTS simrs_room_directory (
    room_code VARCHAR(100) PRIMARY KEY,
    room_name VARCHAR(150) NOT NULL,
    ward_code VARCHAR(100) NOT NULL,
    ward_name VARCHAR(150) NOT NULL,
    floor INTEGER NOT NULL,
    beds JSONB NOT NULL DEFAULT '[]'::jsonb,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    available BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS simrs_integration_state (
    id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
    status VARCHAR(30) NOT NULL,
    source VARCHAR(30) NOT NULL,
    last_success_at TIMESTAMPTZ,
    last_attempt_at TIMESTAMPTZ,
    last_http_status INTEGER,
    last_error TEXT,
    mapping_hash VARCHAR(64)
);
