-- V8: registry robot + persistensi perintah downlink (kontrak docs/api-contracts/robot-command.md).
-- Baris m_robot selain yang di-seed = robot sungguhan terdaftar (tampil OFFLINE di /robots).
CREATE TABLE IF NOT EXISTS m_robot (
    robot_id      TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    model         TEXT DEFAULT 'NEVO-A1',
    registered_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS t_robot_command (
    command_id  UUID PRIMARY KEY,
    robot_id    TEXT NOT NULL REFERENCES m_robot(robot_id),
    command     TEXT NOT NULL,
    params      JSONB DEFAULT '{}',
    user_name   TEXT,
    status      TEXT NOT NULL DEFAULT 'RECEIVED',
    reason_code TEXT,
    created_at  TIMESTAMPTZ DEFAULT now(),
    finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_t_robot_command_robot  ON t_robot_command(robot_id);
CREATE INDEX IF NOT EXISTS idx_t_robot_command_status ON t_robot_command(status);

INSERT INTO m_robot (robot_id, name) VALUES ('NEVO-01', 'Robot Pengantar Obat NEVO #1')
ON CONFLICT DO NOTHING;
