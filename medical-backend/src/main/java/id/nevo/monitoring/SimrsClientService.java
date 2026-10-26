package id.nevo.monitoring;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import jakarta.annotation.PostConstruct;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/** Single server-to-server adapter for the FINAL HTTP SIMRS contract. */
@Service
public class SimrsClientService {
    private static final Logger log = LoggerFactory.getLogger(SimrsClientService.class);
    private static final String TOKEN_HEADER = "x-monitoring-token";
    private static final String MAPPING = "/api/v1/monitoring/mapping";
    private static final String SNAPSHOT = "/api/v1/monitoring/snapshot";
    private static final String ACTIVE = "/api/v1/monitoring/active-deliveries";
    private static final String PATIENT = "/api/v1/monitoring/patient/";
    private static final String DELIVERY_STATUS = "/api/v1/monitoring/delivery-status";
    private static final Set<String> MONITORING_STATUSES = Set.of(
            "DELIVERY_REQUESTED", "PENDING_INTEGRATION", "MOCK_IN_TRANSIT", "MOCK_ARRIVED_AT_ROOM", "CANCELLED");

    private final SimrsProperties properties;
    private final JdbcTemplate db;
    private final HttpClient httpClient;
    private final ObjectMapper json = new ObjectMapper();
    private final ObjectMapper yaml = new ObjectMapper(new YAMLFactory());
    private volatile Instant lastSyncTime;
    private volatile String lastSyncStatus = "NOT_SYNCED";
    private volatile String cachedMappingYaml;
    private volatile Instant lastSnapshotCursor;
    private volatile List<Map<String, Object>> cachedActiveDeliveries = List.of();

    @Autowired
    public SimrsClientService(SimrsProperties properties, JdbcTemplate db) {
        this.properties = properties;
        this.db = db;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofMillis(Math.max(1, properties.getConnectTimeoutMs())))
                // HTTP/1.1 eksplisit: server SIMRS (Node/Next.js dev) menutup koneksi
                // bila HttpClient mencoba upgrade h2c ("header parser received no bytes").
                .version(HttpClient.Version.HTTP_1_1)
                .build();
    }

    // Used only by focused unit tests; production wiring uses SimrsProperties.
    SimrsClientService(String baseUrl, String token, boolean enabled, boolean writeEnabled, int pollInterval) {
        this.properties = new SimrsProperties();
        this.properties.setBaseUrl(baseUrl);
        this.properties.setMonitoringToken(token);
        this.properties.setEnabled(enabled);
        this.properties.setWriteEnabled(writeEnabled);
        this.properties.setPollIntervalSeconds(pollInterval);
        this.db = null;
        this.httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).version(HttpClient.Version.HTTP_1_1).build();
    }

    @PostConstruct
    public void syncAtStartup() { pollAll(); }

    @Scheduled(fixedDelayString = "${nevo.simrs.poll-interval-millis:30000}", initialDelayString = "${nevo.simrs.poll-interval-millis:30000}")
    public void pollMapping() { pollAll(); }

    /** One non-overlapping poll cycle for all FINAL HTTP read endpoints. */
    public synchronized void pollAll() {
        if (!properties.isConfigured()) {
            lastSyncStatus = properties.isEnabled() ? "MISCONFIGURED" : "DISABLED";
            saveState(lastSyncStatus, null, "SIMRS belum dikonfigurasi");
            return;
        }
        String failure = null;
        Integer httpStatus = null;
        boolean mappingOk = false;
        boolean snapshotOk = false;
        boolean deliveriesOk = false;
        try {
            String body = getText(MAPPING, "application/yaml");
            JsonNode root = yaml.readTree(body);
            validateLiveMapping(root);
            cachedMappingYaml = body;
            if (db != null) upsertLiveDirectory(root);
            mappingOk = true;
        } catch (HttpStatusException ex) {
            failure = classify(ex.statusCode); httpStatus = ex.statusCode;
            log.warn("SIMRS mapping poll failed with HTTP {}", ex.statusCode);
        } catch (Exception ex) {
            failure = "DISCONNECTED";
            log.warn("SIMRS mapping poll failed: {}", safeMessage(ex));
        }
        try {
            String since = lastSnapshotCursor == null ? null : lastSnapshotCursor.toString();
            JsonNode snapshot = getSnapshot(since, 200);
            validateSnapshot(snapshot);
            saveSnapshot(snapshot);
            lastSnapshotCursor = Instant.now();
            snapshotOk = true;
        } catch (HttpStatusException ex) {
            if (failure == null || "DISCONNECTED".equals(failure)) failure = classify(ex.statusCode);
            httpStatus = ex.statusCode;
            log.warn("SIMRS snapshot poll failed with HTTP {}", ex.statusCode);
        } catch (Exception ex) {
            if (failure == null) failure = "DISCONNECTED";
            log.warn("SIMRS snapshot poll failed: {}", safeMessage(ex));
        }
        try {
            JsonNode active = getJson(ACTIVE + "?limit=200");
            List<Map<String, Object>> deliveries = parseDeliveries(active);
            saveActiveDeliveries(deliveries);
            deliveriesOk = true;
        } catch (HttpStatusException ex) {
            if (failure == null || "DISCONNECTED".equals(failure)) failure = classify(ex.statusCode);
            httpStatus = ex.statusCode;
            log.warn("SIMRS active deliveries poll failed with HTTP {}", ex.statusCode);
        } catch (Exception ex) {
            if (failure == null) failure = "DISCONNECTED";
            log.warn("SIMRS active deliveries poll failed: {}", safeMessage(ex));
        }
        if (mappingOk || snapshotOk || deliveriesOk) {
            if (failure == null) lastSyncTime = Instant.now();
            lastSyncStatus = "AUTH_ERROR".equals(failure) ? "AUTH_ERROR" : (failure == null ? "CONNECTED" : "STALE");
            saveState(lastSyncStatus, httpStatus, failure == null ? null : "Sebagian data SIMRS gagal diambil");
        } else {
            lastSyncStatus = "AUTH_ERROR".equals(failure) ? "AUTH_ERROR"
                    : ((cachedMappingYaml != null || !cachedActiveDeliveries.isEmpty()) ? "STALE" : (failure == null ? "DISCONNECTED" : failure));
            saveState(lastSyncStatus, httpStatus, "Tidak ada endpoint SIMRS yang berhasil diambil");
        }
    }

    public synchronized Map<String, Object> syncMapping() {
        if (!properties.isConfigured()) {
            lastSyncStatus = properties.isEnabled() ? "MISCONFIGURED" : "DISABLED";
            saveState(lastSyncStatus, null, "SIMRS belum dikonfigurasi");
            return Map.of("status", lastSyncStatus, "source", "NONE");
        }
        try {
            String body = getText(MAPPING, "application/yaml");
            JsonNode root = yaml.readTree(body);
            validateLiveMapping(root);
            cachedMappingYaml = body;
            if (db != null) upsertLiveDirectory(root);
            lastSyncTime = Instant.now();
            lastSyncStatus = "CONNECTED";
            saveState(lastSyncStatus, 200, null);
            return Map.of("status", "CONNECTED", "source", "SIMRS_LIVE", "lastSyncTime", lastSyncTime.toString(), "wards", root.path("wards").size(), "rooms", countRooms(root));
        } catch (HttpStatusException ex) {
            lastSyncStatus = ex.statusCode == 401 || ex.statusCode == 403 ? "AUTH_ERROR" : "DISCONNECTED";
            saveState(lastSyncStatus, ex.statusCode, "SIMRS mengembalikan HTTP " + ex.statusCode);
            log.warn("SIMRS mapping sync failed with HTTP {}", ex.statusCode);
            return Map.of("status", lastSyncStatus, "source", cachedMappingYaml == null ? "NONE" : "CACHED");
        } catch (Exception ex) {
            lastSyncStatus = "DISCONNECTED";
            saveState(lastSyncStatus, null, "SIMRS mapping tidak dapat diambil");
            log.warn("SIMRS mapping sync failed: {}", safeMessage(ex));
            return Map.of("status", "DISCONNECTED", "source", cachedMappingYaml == null ? "NONE" : "CACHED");
        }
    }

    private String classify(int status) { return status == 401 || status == 403 ? "AUTH_ERROR" : "DISCONNECTED"; }

    private void validateSnapshot(JsonNode root) {
        if (!root.isObject() || !root.path("patients").isArray() || !root.path("deliveries").isArray() || !root.path("rooms").isArray()) {
            throw new IllegalArgumentException("Snapshot SIMRS tidak sesuai kontrak");
        }
    }

    private List<Map<String, Object>> parseDeliveries(JsonNode root) {
        JsonNode items = root.isArray() ? root : root.path("deliveries");
        if (!items.isArray()) throw new IllegalArgumentException("Active deliveries SIMRS tidak sesuai kontrak");
        List<Map<String, Object>> result = new ArrayList<>();
        for (JsonNode item : items) result.add(json.convertValue(item, Map.class));
        return result;
    }

    private void saveSnapshot(JsonNode snapshot) {
        if (db != null) db.update("INSERT INTO t_simrs_snapshot_cache(id,payload,last_seen_at) VALUES(true,CAST(? AS jsonb),now()) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,last_seen_at=excluded.last_seen_at", snapshot.toString());
    }

    private void saveActiveDeliveries(List<Map<String, Object>> deliveries) throws Exception {
        Set<String> seen = new HashSet<>();
        for (Map<String, Object> delivery : deliveries) {
            String code = Objects.toString(delivery.get("requestCode"), "");
            if (code.isBlank() || !seen.add(code)) throw new IllegalArgumentException("requestCode active delivery kosong/duplikat");
        }
        if (db == null) { cachedActiveDeliveries = List.copyOf(deliveries); return; }
        for (Map<String, Object> delivery : deliveries) {
            String code = Objects.toString(delivery.get("requestCode"), "");
            db.update("INSERT INTO t_simrs_active_delivery_cache(request_code,payload,last_seen_at) VALUES(?,CAST(? AS jsonb),now()) ON CONFLICT(request_code) DO UPDATE SET payload=excluded.payload,last_seen_at=excluded.last_seen_at", code, json.writeValueAsString(delivery));
        }
        if (seen.isEmpty()) db.update("DELETE FROM t_simrs_active_delivery_cache");
        else db.update("DELETE FROM t_simrs_active_delivery_cache WHERE request_code NOT IN (" + String.join(",", Collections.nCopies(seen.size(), "?")) + ")", seen.toArray());
        cachedActiveDeliveries = List.copyOf(deliveries);
    }

    private void validateLiveMapping(JsonNode root) {
        if (root.path("version").asInt() != 1 || !root.path("wards").isArray()) throw new IllegalArgumentException("Mapping SIMRS tidak sesuai kontrak YAML");
        Set<String> codes = new HashSet<>();
        for (JsonNode ward : root.path("wards")) {
            if (ward.path("code").asText().isBlank() || !ward.path("rooms").isArray() || !ward.path("floor").canConvertToInt()) throw new IllegalArgumentException("Ward SIMRS tidak valid");
            for (JsonNode room : ward.path("rooms")) if (room.path("roomCode").asText().isBlank() || !codes.add(room.path("roomCode").asText())) throw new IllegalArgumentException("roomCode SIMRS kosong atau duplikat");
        }
        if (codes.isEmpty()) throw new IllegalArgumentException("Mapping SIMRS tidak memiliki ruangan");
    }

    private int countRooms(JsonNode root) { int count = 0; for (JsonNode ward : root.path("wards")) count += ward.path("rooms").size(); return count; }

    private void upsertLiveDirectory(JsonNode root) {
        Set<String> seen = new HashSet<>();
        for (JsonNode ward : root.path("wards")) for (JsonNode room : ward.path("rooms")) {
            String code = room.path("roomCode").asText(); seen.add(code);
            db.update("INSERT INTO m_simrs_room_directory(room_code,room_name,ward_code,ward_name,floor,beds,last_seen_at,available) VALUES (?,?,?,?,?,CAST(? AS jsonb),now(),true) ON CONFLICT(room_code) DO UPDATE SET room_name=excluded.room_name,ward_code=excluded.ward_code,ward_name=excluded.ward_name,floor=excluded.floor,beds=excluded.beds,last_seen_at=now(),available=true", code, room.path("name").asText(), ward.path("code").asText(), ward.path("name").asText(), ward.path("floor").asInt(), room.path("beds").toString());
        }
        String placeholders = String.join(",", Collections.nCopies(seen.size(), "?"));
        db.update("UPDATE m_simrs_room_directory SET available=false WHERE room_code NOT IN (" + placeholders + ")", seen.toArray());
    }

    private void saveState(String status, Integer httpStatus, String error) {
        if (db == null) return;
        db.update("INSERT INTO m_simrs_integration_state(id,status,source,last_success_at,last_attempt_at,last_http_status,last_error,mapping_hash) VALUES(true,?,?,CASE WHEN ?='CONNECTED' THEN now() ELSE NULL END,now(),?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,source=excluded.source,last_success_at=COALESCE(excluded.last_success_at,m_simrs_integration_state.last_success_at),last_attempt_at=excluded.last_attempt_at,last_http_status=excluded.last_http_status,last_error=excluded.last_error,mapping_hash=COALESCE(excluded.mapping_hash,m_simrs_integration_state.mapping_hash)", status, "SIMRS", status, httpStatus, error, cachedMappingYaml == null ? null : sha256(cachedMappingYaml));
    }

    private String sha256(String value) { try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); } catch (Exception e) { return null; } }

    public List<Map<String, Object>> getLiveRooms() {
        if (db == null) return List.of();
        String source = db.query("SELECT status FROM m_simrs_integration_state WHERE id=true", rs -> rs.next() && "CONNECTED".equals(rs.getString("status"))) ? "SIMRS Live" : "Cached / Stale";
        List<Map<String, Object>> rooms = db.query("SELECT r.room_code,r.room_name,r.ward_code,r.ward_name,r.floor,r.beds,r.last_seen_at,w.id AS waypoint_id FROM m_simrs_room_directory r LEFT JOIN m_waypoint w ON w.room_code=r.room_code AND w.map_id IN (SELECT id FROM m_mapping_import WHERE kind='ROS' AND active=true) WHERE r.available=true ORDER BY r.ward_code,r.room_code", (rs, n) -> {
            Map<String, Object> row = new LinkedHashMap<>(); row.put("roomCode", rs.getString("room_code")); row.put("name", rs.getString("room_name")); row.put("wardCode", rs.getString("ward_code")); row.put("wardName", rs.getString("ward_name")); row.put("floor", rs.getInt("floor")); row.put("beds", rs.getString("beds")); row.put("lastSeenAt", rs.getTimestamp("last_seen_at")); row.put("waypointId", rs.getObject("waypoint_id")); row.put("availableInSimrs", true); row.put("source", source); return row;
        });
        for (Map<String, Object> row : rooms) {
            Object waypointId = row.get("waypointId");
            row.put("waypointStatus", waypointId == null ? "Belum dipetakan" : "Terpetakan");
        }
        rooms.addAll(db.query("SELECT DISTINCT w.room_code,w.name FROM m_waypoint w JOIN m_mapping_import m ON m.id=w.map_id AND m.kind='ROS' AND m.active=true WHERE NOT EXISTS (SELECT 1 FROM m_simrs_room_directory r WHERE r.room_code=w.room_code AND r.available=true)", (rs, n) -> {
            Map<String, Object> row = new LinkedHashMap<>(); row.put("roomCode", rs.getString("room_code")); row.put("name", rs.getString("name")); row.put("wardCode", null); row.put("wardName", null); row.put("floor", null); row.put("availableInSimrs", false); row.put("source", "Local waypoint"); row.put("waypointStatus", "Perlu rekonsiliasi"); row.put("navigable", false); return row;
        }));
        return rooms;
    }

    /** write live = tulis diaktifkan DAN SIMRS terkonfigurasi (URL + token valid). Dipakai robot sebelum push. */
    public boolean isWriteLive() { return properties.isWriteLive(); }

    public Map<String, Object> getConnectionStatus() {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("enabled", properties.isEnabled());
        result.put("writeEnabled", properties.isWriteEnabled());
        result.put("tokenConfigured", !blank(properties.getMonitoringToken()));
        result.put("host", safeHost(properties.getBaseUrl()));
        result.put("lastSyncTime", lastSyncTime == null ? null : lastSyncTime.toString());
        result.put("lastSyncStatus", lastSyncStatus);

        if (!properties.isEnabled()) {
            result.put("mode", "OFFLINE");
            result.put("code", "DISABLED");
            result.put("message", "Integrasi SIMRS dinonaktifkan melalui konfigurasi backend.");
            return result;
        }
        if (!properties.isConfigured()) {
            result.put("mode", "MISCONFIGURED");
            result.put("code", "INVALID_CONFIGURATION");
            result.put("message", "SIMRS_ENABLED=true memerlukan URL HTTPS dan token backend yang valid.");
            return result;
        }
        String status = lastSyncStatus;
        result.put("lastSyncTime", lastSyncTime == null ? null : lastSyncTime.toString());
        result.put("lastSyncStatus", lastSyncStatus);
        result.put("source", "CONNECTED".equals(status) ? "SIMRS_LIVE" : (cachedMappingYaml == null ? "NONE" : "CACHED"));
        result.put("mode", "CONNECTED".equals(status) ? "LIVE_READ_ONLY" : status);
        result.put("code", status);
        if (!"CONNECTED".equals(status)) result.put("message", status.equals("AUTH_ERROR") ? "Token SIMRS ditolak oleh endpoint." : "SIMRS belum sepenuhnya tersinkron; cache dipertahankan.");
        return result;
    }

    public String getMappingYaml() {
        if (!properties.isConfigured()) return null;
        if (cachedMappingYaml == null) throw new IllegalStateException("SIMRS mapping belum tersedia di cache");
        return cachedMappingYaml;
    }

    public JsonNode getSnapshot(String since, int limit) {
        String query = "?limit=" + Math.min(limit, 200);
        if (since != null && !since.isBlank()) query = "?since=" + URLEncoder.encode(since, StandardCharsets.UTF_8) + "&limit=" + Math.min(limit, 200);
        return getJson(SNAPSHOT + query);
    }
    public JsonNode getPatient(String mrn) { return getJson(PATIENT + URLEncoder.encode(mrn, StandardCharsets.UTF_8)); }

    public List<Map<String, Object>> getActiveDeliveries() {
        if (db == null) return cachedActiveDeliveries;
        return db.query("SELECT payload::text FROM t_simrs_active_delivery_cache ORDER BY last_seen_at DESC", (rs, n) -> {
            try { return json.convertValue(json.readTree(rs.getString(1)), Map.class); }
            catch (Exception ex) { return Map.<String,Object>of(); }
        });
    }

    public Map<String, Object> postDeliveryStatus(String requestCode, String toStatus, String note, Integer compartmentNo, String idempotencyKey) {
        validateStatusRequest(requestCode, toStatus, compartmentNo, idempotencyKey);
        if (!properties.isWriteEnabled()) return Map.of("success", true, "simulated", true, "duplicate", false, "requestCode", requestCode, "toStatus", toStatus, "message", "SIMRS_WRITE_ENABLED=false; tidak ada POST ke SIMRS.");
        if (!properties.isConfigured()) throw new IllegalStateException("SIMRS belum dikonfigurasi; POST ditolak.");
        return sendDeliveryStatusWithRetry(requestCode, toStatus, note, compartmentNo, idempotencyKey);
    }

    private static final long[] RETRY_BACKOFF_MS = {1_000, 5_000, 30_000, 120_000}; // kontrak §1.1

    /**
     * Retry policy kontrak §1.1: maksimal {@code writeMaxAttempts} percobaan (default 5);
     * retryable = 5xx / 429 / timeout / IOException dengan backoff diskrit 1s, 5s, 30s, 2m
     * dan idempotencyKey SAMA; non-retryable (422/404/409/401/4xx lain) dilempar langsung tanpa retry.
     * Hasil selalu memuat field {@code attempts}; bila percobaan retryable habis,
     * melempar IllegalStateException.
     */
    private Map<String, Object> sendDeliveryStatusWithRetry(String requestCode, String toStatus, String note, Integer compartmentNo, String idempotencyKey) {
        int max = Math.max(1, properties.getWriteMaxAttempts());
        IllegalStateException last = null;
        for (int attempt = 1; attempt <= max; attempt++) {
            if (attempt > 1) sleepDeliveryBackoff(RETRY_BACKOFF_MS[Math.min(attempt - 2, RETRY_BACKOFF_MS.length - 1)]);
            try {
                Map<String, Object> body = new LinkedHashMap<>();
                body.put("requestCode", requestCode); body.put("toStatus", toStatus);
                if (note != null && !note.isBlank()) body.put("note", note);
                if (compartmentNo != null) body.put("compartmentNo", compartmentNo);
                if (idempotencyKey != null) body.put("idempotencyKey", idempotencyKey);
                HttpResponse<String> response = send("POST", DELIVERY_STATUS, json.writeValueAsString(body), "application/json");
                int code = response.statusCode();
                Map<String, Object> result = new LinkedHashMap<>();
                result.put("httpStatus", code);
                result.put("attempts", attempt);
                if (!response.body().isBlank()) result.putAll(json.convertValue(json.readTree(response.body()), Map.class));
                if (code < 300) return result;
                if (code == 429 || code >= 500) {
                    log.warn("POST delivery-status gagal (attempt {}/{}): HTTP {} (retryable, requestCode={})", attempt, max, code, requestCode);
                    last = new IllegalStateException("SIMRS mengembalikan HTTP " + code + " setelah " + attempt + " percobaan");
                    continue;
                }
                log.warn("POST delivery-status ditolak: HTTP {} (tidak diretry, requestCode={})", code, requestCode);
                return result;
            } catch (IllegalStateException ex) { throw ex; }
            catch (Exception ex) {
                log.warn("POST delivery-status gagal (attempt {}/{}): {}", attempt, max, safeMessage(ex));
                last = new IllegalStateException("Gagal mengirim status SIMRS: " + safeMessage(ex), ex);
            }
        }
        throw last != null ? last : new IllegalStateException("Gagal mengirim status SIMRS");
    }

    private void sleepDeliveryBackoff(long delayMs) {
        if (delayMs <= 0) return;
        try { Thread.sleep(delayMs); }
        catch (InterruptedException ie) { Thread.currentThread().interrupt(); }
    }

    public Map<String, Object> postDeliveryStatus(String requestCode, String toStatus, Integer compartmentNo, String idempotencyKey) {
        return postDeliveryStatus(requestCode, toStatus, null, compartmentNo, idempotencyKey);
    }

    private void validateStatusRequest(String requestCode, String toStatus, Integer compartmentNo, String key) {
        if ("MOCK_HANDOVER_CONFIRMED".equals(toStatus)) throw new IllegalArgumentException("Konfirmasi serah-terima hanya boleh melalui scan manusia di SIMRS");
        if (blank(requestCode) || blank(toStatus) || !MONITORING_STATUSES.contains(toStatus)) throw new IllegalArgumentException("requestCode dan toStatus kontrak wajib valid");
        if (key != null && !key.matches("^[A-Za-z0-9._:-]{1,64}$")) throw new IllegalArgumentException("idempotencyKey tidak sesuai kontrak");
        if (compartmentNo != null && compartmentNo < 0) throw new IllegalArgumentException("compartmentNo harus integer >= 0");
        if (compartmentNo != null && !"MOCK_ARRIVED_AT_ROOM".equals(toStatus)) throw new IllegalArgumentException("compartmentNo hanya boleh saat MOCK_ARRIVED_AT_ROOM");
    }

    private JsonNode getJson(String path) {
        try { return json.readTree(getText(path, "application/json")); }
        catch (HttpStatusException ex) { throw ex; }
        catch (Exception ex) { throw new IllegalStateException("SIMRS read API tidak tersedia", ex); }
    }
    private String getText(String path, String accept) throws Exception {
        HttpResponse<String> response = request("GET", path, null, accept);
        if (response.statusCode() >= 300) throw new HttpStatusException(response.statusCode());
        return response.body();
    }
    private HttpResponse<String> request(String method, String path, String body, String accept) throws Exception {
        HttpResponse<String> response = send(method, path, body, accept);
        if (response.statusCode() >= 300) throw new HttpStatusException(response.statusCode());
        return response;
    }

    /** Varian tanpa lempar untuk POST delivery-status: pemanggil inspeksi kode status sendiri (kebutuhan retry kontrak §1.1). */
    private HttpResponse<String> send(String method, String path, String body, String accept) throws Exception {
        HttpRequest.Builder builder = HttpRequest.newBuilder().uri(URI.create(properties.normalizedBaseUrl() + path)).timeout(Duration.ofMillis(Math.max(1, properties.getReadTimeoutMs())))
                .header(TOKEN_HEADER, properties.getMonitoringToken()).header("Accept", accept);
        if ("POST".equals(method)) builder.header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofString(body)); else builder.GET();
        return httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }
    private static boolean blank(String value) { return value == null || value.isBlank(); }
    private static String safeHost(String raw) { try { return raw == null || raw.isBlank() ? null : URI.create(raw).getHost(); } catch (Exception e) { return null; } }
    private static String safeMessage(Exception ex) { return ex.getClass().getSimpleName(); }

    private static final class HttpStatusException extends RuntimeException {
        private final int statusCode;
        private HttpStatusException(int statusCode) { this.statusCode = statusCode; }
    }

}
