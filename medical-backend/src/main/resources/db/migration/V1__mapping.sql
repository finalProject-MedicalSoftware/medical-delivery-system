CREATE TABLE mapping_imports (
 id UUID PRIMARY KEY, kind VARCHAR(20) NOT NULL CHECK (kind IN ('SIMRS','ROS')),
 file_name VARCHAR(255) NOT NULL, checksum VARCHAR(64) NOT NULL, storage_path TEXT,
 summary JSONB NOT NULL, created_by VARCHAR(100) NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 active BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE UNIQUE INDEX one_active_mapping_per_kind ON mapping_imports(kind) WHERE active;
CREATE TABLE waypoints (
 id UUID PRIMARY KEY, map_id UUID NOT NULL REFERENCES mapping_imports(id),
 room_code VARCHAR(100), name VARCHAR(150) NOT NULL,
 x DOUBLE PRECISION NOT NULL, y DOUBLE PRECISION NOT NULL, yaw DOUBLE PRECISION NOT NULL,
 enabled BOOLEAN NOT NULL DEFAULT TRUE,
 created_by VARCHAR(100) NOT NULL,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(map_id, room_code)
);
CREATE TABLE mapping_audit (
 id BIGSERIAL PRIMARY KEY, actor VARCHAR(100) NOT NULL, operation VARCHAR(60) NOT NULL,
 mapping_id UUID, happened_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
