-- Flyway Migration V6: KP TIFA naming convention (m_/t_/h_) + mission status enum types
-- plus multi-stop missions and tray compartment assignment.

-- 1. CHECK on missions.status must go before the column becomes an enum type.
ALTER TABLE missions DROP CONSTRAINT IF EXISTS missions_status_check;

-- 2. Table renames.
ALTER TABLE mapping_imports             RENAME TO m_mapping_import;
ALTER TABLE waypoints                   RENAME TO m_waypoint;
ALTER TABLE mapping_audit               RENAME TO h_mapping_audit;
ALTER TABLE missions                    RENAME TO t_mission;
ALTER TABLE mission_events              RENAME TO h_mission_event;
ALTER TABLE simrs_room_directory        RENAME TO m_simrs_room_directory;
ALTER TABLE simrs_integration_state     RENAME TO m_simrs_integration_state;
ALTER TABLE simrs_active_delivery_cache RENAME TO t_simrs_active_delivery_cache;
ALTER TABLE simrs_snapshot_cache        RENAME TO t_simrs_snapshot_cache;

-- 3. Constraint renames (Postgres auto-generated names still carry the old table name).
ALTER TABLE m_mapping_import RENAME CONSTRAINT mapping_imports_pkey      TO m_mapping_import_pkey;
ALTER TABLE m_mapping_import RENAME CONSTRAINT mapping_imports_kind_check TO m_mapping_import_kind_check;
ALTER TABLE m_waypoint       RENAME CONSTRAINT waypoints_pkey            TO m_waypoint_pkey;
ALTER TABLE m_waypoint       RENAME CONSTRAINT waypoints_map_id_fkey     TO m_waypoint_map_id_fkey;
ALTER TABLE m_waypoint       RENAME CONSTRAINT waypoints_map_id_room_code_key TO m_waypoint_map_id_room_code_key;
ALTER TABLE h_mapping_audit  RENAME CONSTRAINT mapping_audit_pkey        TO h_mapping_audit_pkey;
ALTER TABLE t_mission        RENAME CONSTRAINT missions_pkey             TO t_mission_pkey;
ALTER TABLE t_mission        RENAME CONSTRAINT missions_waypoint_id_fkey TO t_mission_waypoint_id_fkey;
ALTER TABLE h_mission_event  RENAME CONSTRAINT mission_events_pkey      TO h_mission_event_pkey;
ALTER TABLE h_mission_event  RENAME CONSTRAINT mission_events_mission_id_fkey TO h_mission_event_mission_id_fkey;
ALTER TABLE m_simrs_room_directory    RENAME CONSTRAINT simrs_room_directory_pkey    TO m_simrs_room_directory_pkey;
ALTER TABLE m_simrs_integration_state RENAME CONSTRAINT simrs_integration_state_pkey TO m_simrs_integration_state_pkey;
ALTER TABLE m_simrs_integration_state RENAME CONSTRAINT simrs_integration_state_id_check TO m_simrs_integration_state_id_check;
ALTER TABLE t_simrs_active_delivery_cache RENAME CONSTRAINT simrs_active_delivery_cache_pkey TO t_simrs_active_delivery_cache_pkey;
ALTER TABLE t_simrs_snapshot_cache        RENAME CONSTRAINT simrs_snapshot_cache_pkey        TO t_simrs_snapshot_cache_pkey;
ALTER TABLE t_simrs_snapshot_cache        RENAME CONSTRAINT simrs_snapshot_cache_id_check    TO t_simrs_snapshot_cache_id_check;

-- Indexes.
ALTER INDEX idx_waypoints_map_id          RENAME TO idx_m_waypoint_map_id;
ALTER INDEX idx_mapping_audit_mapping_id  RENAME TO idx_h_mapping_audit_mapping_id;
ALTER INDEX idx_mapping_imports_kind      RENAME TO idx_m_mapping_import_kind;
ALTER INDEX idx_missions_status           RENAME TO idx_t_mission_status;
ALTER INDEX idx_missions_created_at       RENAME TO idx_t_mission_created_at;
ALTER INDEX idx_mission_events_mission_id RENAME TO idx_h_mission_event_mission_id;
-- one_active_mapping_per_kind carries no table prefix: left as is on purpose.

-- 4. Enum types for mission status (same value set the old CHECK enforced).
CREATE TYPE mission_status AS ENUM (
    'SUBMITTED', 'BACKEND_ACCEPTED', 'ROBOT_ACKNOWLEDGED',
    'EXECUTING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'UNKNOWN'
);
ALTER TABLE t_mission       ALTER COLUMN status TYPE mission_status USING status::mission_status;
ALTER TABLE h_mission_event ALTER COLUMN status TYPE mission_status USING status::mission_status;

-- 5. Multi-stop missions: a mission may no longer be pinned to exactly one waypoint.
ALTER TABLE t_mission ALTER COLUMN waypoint_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS t_mission_stop (
    id           UUID PRIMARY KEY,
    mission_id   UUID NOT NULL REFERENCES t_mission(id) ON DELETE CASCADE,
    sequence_no  INTEGER NOT NULL,
    waypoint_id  UUID REFERENCES m_waypoint(id),
    room_code    VARCHAR(100) NOT NULL,
    request_code VARCHAR(100),
    status       mission_status NOT NULL DEFAULT 'SUBMITTED',
    arrived_at   TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT t_mission_stop_mission_id_sequence_no_key UNIQUE (mission_id, sequence_no)
);
CREATE INDEX IF NOT EXISTS idx_t_mission_stop_mission_id ON t_mission_stop(mission_id);

-- 6. Tray: one compartment holds one patient's medicines (possibly several).
CREATE TABLE IF NOT EXISTS t_delivery_compartment (
    id             UUID PRIMARY KEY,
    mission_id     UUID NOT NULL REFERENCES t_mission(id) ON DELETE CASCADE,
    compartment_no INTEGER NOT NULL,
    patient_mrn    VARCHAR(100),
    medicine_ids   JSONB NOT NULL DEFAULT '[]'::jsonb,
    filled_at      TIMESTAMPTZ,
    emptied_at     TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT t_delivery_compartment_mission_id_compartment_no_key UNIQUE (mission_id, compartment_no),
    CONSTRAINT t_delivery_compartment_compartment_no_check CHECK (compartment_no >= 0)
);
CREATE INDEX IF NOT EXISTS idx_t_delivery_compartment_mission_id ON t_delivery_compartment(mission_id);
