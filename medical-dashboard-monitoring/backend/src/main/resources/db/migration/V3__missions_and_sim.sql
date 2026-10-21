-- Flyway Migration V3: Missions, Mission Events, and Simulation Tables
CREATE TABLE IF NOT EXISTS missions (
    id UUID PRIMARY KEY,
    robot_id VARCHAR(50) NOT NULL,
    waypoint_id UUID NOT NULL REFERENCES waypoints(id),
    room_code VARCHAR(100),
    created_by VARCHAR(100) NOT NULL,
    status VARCHAR(30) NOT NULL CHECK (status IN (
        'SUBMITTED', 'BACKEND_ACCEPTED', 'ROBOT_ACKNOWLEDGED',
        'EXECUTING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'UNKNOWN'
    )),
    request_code VARCHAR(100),
    simulated BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mission_events (
    id BIGSERIAL PRIMARY KEY,
    mission_id UUID NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
    status VARCHAR(30) NOT NULL,
    source VARCHAR(30) NOT NULL, -- e.g. 'BACKEND', 'SIMULATED_ROBOT', 'OPERATOR'
    message TEXT,
    happened_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_missions_status ON missions(status);
CREATE INDEX IF NOT EXISTS idx_missions_created_at ON missions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mission_events_mission_id ON mission_events(mission_id);
