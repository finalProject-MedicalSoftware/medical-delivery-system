# Local Docker workflow (prototype data only)

The SIMRS Dummy database and medical backend database are separate persistent volumes. Kafka is intentionally not included; the WS gateway is optional and runs in HTTP-bridge-only mode.

```sh
# Run only both PostgreSQL databases (default profile)
cp .env.example .env  # edit passwords/secrets first
docker compose up -d

# Run SIMRS web + medical backend and their databases
docker compose --profile apps up -d --build

# Add the optional WS gateway (Kafka remains disabled)
docker compose --profile apps --profile ws up -d --build

docker compose ps
docker compose logs -f medical-backend simrs-web
docker compose stop
```

Defaults bind host ports to loopback: SIMRS PostgreSQL `5433`, medical PostgreSQL `5434` (moved from `15432` to avoid the monitoring database already using that port), SIMRS web `3000`, backend `8082` (container port `8080`), and WS `8083`. The backend's host port is deliberately `8082` to avoid colliding with an existing service on `8080`. Change host ports in `.env` if already occupied. `docker compose stop` does not remove persistent volumes. Do not run `down -v` unless you intend to delete both databases permanently.

Replace all example passwords/secrets in `.env` with unique local values. SIMRS integration and writes remain disabled by default. Enable them only when the integration token and contract configuration are ready. This is a local academic prototype with synthetic data, not a clinical/production system.
