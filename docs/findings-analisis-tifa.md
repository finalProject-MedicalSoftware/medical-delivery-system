# Findings

- :3001 was occupied by SIMRS `next-server` PID 61086 started in prior session; stopped. SIMRS should bind :3001 when :3000 is occupied by dashboard.
- User's SIMRS on :3002 cannot sync because configured backend/SIMRS URLs and/or monitoring callback assumptions expect :3001; changing port requires env updates consistently.
- Workspace contains `TIFA/tifa-web`, `TIFA/tifa-be`, `TIFA/tifa-ws`, `TIFA/tifa-app`.

## Gap analysis — TIFA-aligned medical monitoring

### Preserve
- Existing medical pages, REST auth/CSRF, mission queue, simulated robot, SIMRS polling/cache, and medical contracts.
- `medical-ws` channel subscriptions and Bearer/internal-publish authentication.

### Remove/replace
- `AppShell` automatic WebSocket connection: replace with explicit operator-controlled Turn ON/OFF.
- Duplicate `new WebSocket(...)` in `tracking/page.tsx`: consume the global session stream.
- Static integration cards in `settings/page.tsx`: replace with operational Connection settings.
- Status-only “check integration” UI: retain only actionable connection/health state.
- WS default behavior that can look like an implicit connection; keep endpoint/token env-driven, medical WS `:8081`.

### Add/change
- Global session states: `DISCONNECTED`, `CONNECTING`, `CONNECTED`, `LOCKED`, `ERROR`.
- Connection page/menu modeled after TIFA: endpoint, token-present indicator (never secret), channels, manual connect/disconnect, session ownership lock, health and last message.
- Robot command panel and acceptance scope cover all existing supported commands: `CMD_CANCEL_MISSION`, `CMD_RETURN_TO_DOCK`, `CMD_SET_SPEED`, `CMD_TELEOP_DRIVE`.
- `CMD_SET_SPEED` and `CMD_TELEOP_DRIVE` are cross-phase commands, not simulator-only; each non-sim adapter needs safety interlocks/watchdog and traceable ACK/error results.
- Shared telemetry and command-result state across dashboard, robots, missions, and tracking.
- ID/EN dictionary entries for connection, session lock, and robot commands.
- Postman flow and `docs/testing-full-integration.md` updates for CSRF/login, manual WS auth/subscription, telemetry, and robot commands.

### Backend/WS boundary
- No backend contract changes unless a concrete frontend blocker appears.
- Do not weaken WS Bearer or internal bridge auth.
- Preserve compartment and token/logging rules from AGENTS.md.

## P2–P4–Final audit
- **P2 contract:** PASS. Four commands and payload shapes are retained across simulator, ROS/Gazebo target, and physical target.
- **P3 execution:** BLOCKED. Backend remains simulator-coupled; no ROS/Gazebo or physical adapter exists; TIFA downlink is uplink-only.
- **P4 safety/auth:** BLOCKED. Session route lacks server-side authentication/role checks. Real modes also lack proven ACK/timeout, dedupe, watchdog, disconnect/reconnect behavior, and safety acceptance.
- **Final verdict:** Simulator/stand-in only. Do not claim ROS/Gazebo or physical readiness; do not enable movement in those modes until gates pass.

Implementation remains approval-gated; no commits or pushes.
