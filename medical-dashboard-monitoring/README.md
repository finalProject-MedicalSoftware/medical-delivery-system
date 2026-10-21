# NEVO — Mapping & Waypoint MVP

Scaffold for `medical-dashboard-monitoring/`. This is a **development MVP**, not a deployed or tested live robot system.

## Includes
- Next.js App Router + TypeScript + Tailwind CSS mapping screen
- Spring Boot 3 REST API for SIMRS YAML and ROS map (YAML+PGM/PNG) upload
- PostgreSQL + Flyway tables for imports, map versions, waypoint coordinates and audit
- Demo HTTP Basic role access: both admin/operator can import and add waypoints; only admin activates a ROS **web visualization configuration**
- Imported SIMRS YAML does **not** overwrite the official SIMRS live API. Official `/api/v1/monitoring/mapping` sync (every 30 s) remains to be implemented.

## Local setup
Requirements: Java 21, Maven 3.9+, Node 20+, npm, Docker Compose.

1. `docker compose up -d`
2. Start backend, from `backend/`:
   ```bash
   export DATABASE_PASSWORD=change-me
   export NEVO_DEMO_ADMIN_PASSWORD=admin-local-change-me
   export NEVO_DEMO_OPERATOR_PASSWORD=operator-local-change-me
   mvn spring-boot:run
   ```
   PowerShell: use `$env:VARIABLE="value"` instead of `export`.

   For SIMRS configuration, copy `.env.example` to `.env` locally and load it
   into the current PowerShell process before starting Spring Boot (Spring Boot
   does not load `.env` automatically):
   ```powershell
   Copy-Item .env.example .env
   Get-Content .env | ForEach-Object {
       $line = $_.Trim()
       if ($line -and !$line.StartsWith('#')) {
           $key, $value = $line -split '=', 2
           [Environment]::SetEnvironmentVariable($key.Trim(), $value.Trim(), 'Process')
       }
   }
   mvn spring-boot:run
   ```
   Keep `SIMRS_ENABLED=false` for simulation. To use an approved HTTPS
   simulator, set `SIMRS_BASE_URL` and `SIMRS_MONITORING_TOKEN` in the process
   environment, then restart only the backend; no source rebuild is required.
   `SIMRS_WRITE_ENABLED` must remain `false` unless the SIMRS owner explicitly
   approves the POST test.
3. Start frontend, from `frontend/`:
   ```bash
   npm install
   npm run dev
   ```
4. Open `http://localhost:3000/mapping`. Select demo role and enter its configured password; click **Muat daftar mapping**.
5. Upload `samples/simrs-mapping.yaml` to the SIMRS tab. ROS upload requires both `map.yaml` and a referenced PGM/PNG image.

Backend is at `localhost:8081` by default. Set `SERVER_PORT` to another free port if needed and update frontend `BACKEND_URL` accordingly. Keep everything on loopback/LAN development only; HTTP Basic over plain HTTP must **never** be exposed through a public tunnel or production host.

## Current limitations and TODOs
- PGM files are validated and stored, but PGM-to-PNG browser previews are **not implemented**. PNG preview works. Cannot claim full map visualization yet.
- No robot bridge, ROS pose, Nav2 action, teleoperation, WebSocket or Kafka integration is implemented.
- Waypoints are saved with metric coordinates but are not checked for traversability or against live robot map versions. Never dispatch goals without server-side safety and map-version validation.
- Live SIMRS polling is server-side and environment-controlled; manual imports remain preview-only and never replace authoritative SIMRS records.
- Demo users/HTTP Basic are not production identity management. Replace with identity, hashed stored credentials, session/CSRF protection, permission checks, audit and TLS before network deployment.
- Upload handler validates limited YAML structure and file signatures; add full schema validation, image dimensions/pixel limits, YAML parser limits, file quarantine, error handling, integration tests, and access policy before operational use.
- A `.pgm` and `.png` plus the exact `image:` filename referenced by `map.yaml` must be uploaded together. `map.yaml` stays immutable on the robot.
- This starter has not been compiled or exercised against a running PostgreSQL instance in this environment.
