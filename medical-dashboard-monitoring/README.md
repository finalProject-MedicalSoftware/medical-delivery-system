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

## Runbook: teman hanya clone dashboard + ws

Yang diperlukan agar web monitoring jalan: **dashboard** ini + gateway **`medical-ws`** (repo terpisah) + **backend Spring** (`medical-backend`) yang harus hidup karena login dashboard melewati `/api/v1/auth/*` backend — domain web SIMRS (mis. `https://simrs.cdprojectdiagonal.web.id`) **bukan** backend.

**Opsi A — semua dalam Docker (paling cepat):** perlu repo workspace lengkap (dashboard + backend + ws + simrs semua satu folder induk `medical-delivery-system/`), tanpa install Node/Java:

```sh
cd simrs-dummy
cp .env.example .env   # isi WS_AUTH_TOKEN & password minimal
docker compose --profile apps --profile ws up -d --build
```

Dashboard di `http://127.0.0.1:3100` (profil `ws` = Kafka ikut hidup; profil `apps` saja = dashboard tetap jalan, relay WS offline sampai `medical-ws` hidup). Detail layanan & port: `simrs-dummy/DOCKER.md`.

**Opsi B — manual (hanya clone dua repo):**

1. Clone `medical-dashboard-monitoring` dan `medical-ws`. Jalankan backend Spring dari `medical-backend` (Spring Boot, port 8082) dan Redpanda untuk Kafka.
2. Jalankan `medical-ws` (di dalamnya ada Kafka bridging + broadcast WS): `npm install && npm run check && npm run dev` (port 8083 dari host).
3. Jalankan dashboard: `cd frontend && npm install && npm run dev` (port 3000/3100).
4. `.env` frontend (atau lewat halaman **/settings**, admin):
   ```
   BACKEND_URL=http://127.0.0.1:8082
   WS_BACKEND_URL=ws://127.0.0.1:8083/ws/v1/deliveries
   WS_AUTH_TOKEN=<sama dengan WS_AUTH_TOKEN di medical-ws/.env>
   ```
5. Buka `/settings` → login admin → **Set connection** dengan **origin** backend Spring saja (contoh `http://127.0.0.1:8082`) — tanpa trailing slash dan **tanpa `/api/v1`** (sistem yang menyambungkan `/api/v1/...`; keduanya diperbaiki otomatis, tapi origin memang yang benar) → **Turn on** relay.
6. Jika muncul `NOT_THE_BACKEND`: URL yang diisi menjawab 404 di `/api/v1/auth/csrf` — itu tanda host-nya web frontend (Next), bukan backend Spring. Isi URL backend yang benar. Error `SIMRS_UNREACHABLE` berarti host/port tidak merespons (backend tidak jalan).
