-- Bed-specific navigation while preserving legacy room-only waypoints and missions.
ALTER TABLE m_waypoint ADD COLUMN IF NOT EXISTS bed_id VARCHAR(160);

ALTER TABLE m_waypoint DROP CONSTRAINT IF EXISTS m_waypoint_map_id_room_code_key;
DROP INDEX IF EXISTS m_waypoint_map_id_room_code_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_m_waypoint_room_only
    ON m_waypoint(map_id, room_code)
    WHERE room_code IS NOT NULL AND bed_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_m_waypoint_bed
    ON m_waypoint(map_id, room_code, bed_id)
    WHERE room_code IS NOT NULL AND bed_id IS NOT NULL;

ALTER TABLE t_mission ADD COLUMN IF NOT EXISTS manifest_id UUID;
ALTER TABLE t_mission ADD COLUMN IF NOT EXISTS manifest_sequence INTEGER;
ALTER TABLE t_mission ADD COLUMN IF NOT EXISTS patient_mrn VARCHAR(100);
ALTER TABLE t_mission ADD COLUMN IF NOT EXISTS bed_id VARCHAR(160);
ALTER TABLE t_mission ADD COLUMN IF NOT EXISTS placement_updated_at TIMESTAMPTZ;
ALTER TABLE t_mission ADD COLUMN IF NOT EXISTS mission_source VARCHAR(20) NOT NULL DEFAULT 'LEGACY';
ALTER TABLE t_mission ADD CONSTRAINT t_mission_source_check
    CHECK (mission_source IN ('LEGACY', 'SIMRS_REQUEST', 'MANUAL_SIMRS'));

CREATE INDEX IF NOT EXISTS idx_t_mission_manifest ON t_mission(manifest_id, manifest_sequence);
CREATE INDEX IF NOT EXISTS idx_m_waypoint_bed_lookup ON m_waypoint(map_id, room_code, bed_id) WHERE enabled;
