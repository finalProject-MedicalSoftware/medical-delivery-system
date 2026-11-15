-- Keep existing robot IDs and all mission/command references intact.
ALTER TABLE m_robot
    ADD COLUMN device_code VARCHAR(128),
    ADD COLUMN internal_ip INET,
    ADD COLUMN ssid VARCHAR(255),
    ADD COLUMN registration_status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
    ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN disabled_at TIMESTAMPTZ,
    ADD CONSTRAINT ck_m_robot_registration_status CHECK (registration_status IN
        ('DRAFT', 'PENDING_VERIFICATION', 'VERIFIED', 'DISABLED', 'ARCHIVED'));

CREATE UNIQUE INDEX ux_m_robot_device_code ON m_robot (device_code) WHERE device_code IS NOT NULL;
