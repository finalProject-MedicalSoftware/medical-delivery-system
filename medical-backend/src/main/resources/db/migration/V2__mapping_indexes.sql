-- Flyway Migration V2: Add indexes for waypoint queries and audit logging
CREATE INDEX IF NOT EXISTS idx_waypoints_map_id ON waypoints(map_id);
CREATE INDEX IF NOT EXISTS idx_mapping_audit_mapping_id ON mapping_audit(mapping_id);
CREATE INDEX IF NOT EXISTS idx_mapping_imports_kind ON mapping_imports(kind);
