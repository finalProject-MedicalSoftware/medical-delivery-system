-- V10: m_setting table for server-side config persistence (simrs.config key).
-- Reads/writes by SimrsAdminService; frontend reads via /api/v1/simrs/admin/config.
CREATE TABLE IF NOT EXISTS m_setting (
    key_        TEXT PRIMARY KEY,
    value_      JSONB NOT NULL DEFAULT '{}',
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
