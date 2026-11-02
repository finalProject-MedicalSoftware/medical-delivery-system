package id.nevo.monitoring.admin;

import id.nevo.monitoring.SimrsProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.*;

/** Admin-side SIMRS configuration: read/write config + mission reassign. */
@Service
public class SimrsAdminService {

    private static final Logger log = LoggerFactory.getLogger(SimrsAdminService.class);
    private final JdbcTemplate db;
    private final SimrsProperties props;

    public SimrsAdminService(JdbcTemplate db, SimrsProperties props) {
        this.db = db;
        this.props = props;
    }

    // ── config ────────────────────────────────────────────────────────────────

    public Map<String, Object> getConfig() {
        Map<String, Object> cfg = new LinkedHashMap<>();
        cfg.put("enabled", props.isEnabled());
        cfg.put("baseUrl", maskBaseUrl(props.getBaseUrl()));
        cfg.put("writeEnabled", props.isWriteEnabled());
        cfg.put("pollIntervalSeconds", props.getPollIntervalSeconds());
        cfg.put("connectTimeoutMs", props.getConnectTimeoutMs());
        cfg.put("readTimeoutMs", props.getReadTimeoutMs());
        cfg.put("writeMaxAttempts", props.getWriteMaxAttempts());
        cfg.put("configured", props.isConfigured());
        return cfg;
    }

    public Map<String, Object> updateConfig(Map<String, Object> patch) {
        if (patch == null) throw new IllegalArgumentException("patch wajib ada");

        String baseUrl = stringFrom(patch, "baseUrl");
        if (baseUrl != null) props.setBaseUrl(baseUrl.trim());

        Object writeEnabled = patch.get("writeEnabled");
        if (writeEnabled != null) props.setWriteEnabled(Boolean.parseBoolean(writeEnabled.toString()));

        Object pollSec = patch.get("pollIntervalSeconds");
        if (pollSec != null) props.setPollIntervalSeconds(toInt(pollSec, 30));

        Object connTimeout = patch.get("connectTimeoutMs");
        if (connTimeout != null) props.setConnectTimeoutMs(toInt(connTimeout, 5000));

        Object readTimeout = patch.get("readTimeoutMs");
        if (readTimeout != null) props.setReadTimeoutMs(toInt(readTimeout, 10000));

        Object writeMax = patch.get("writeMaxAttempts");
        if (writeMax != null) props.setWriteMaxAttempts(toInt(writeMax, 5));

        savePropsToDb();
        return getConfig();
    }

    public Map<String, Object> patchConfig(Map<String, Object> patch) {
        // alias — same as update; preserves endpoint contract flexibility
        return updateConfig(patch);
    }

    // ── mission reassign ──────────────────────────────────────────────────────

    /**
     * Reassign a single mission to a different robot.
     * Only allowed for QUEUED missions (cannot reassign an in-progress mission).
     */
    public Map<String, Object> reassignMission(UUID missionId, String newRobotId, String operator) {
        // Verify mission exists and is QUEUED
        Integer status = db.queryForObject(
                "SELECT status FROM t_mission WHERE id = ?", Integer.class, missionId);
        if (status == null) throw new NoSuchElementException("Misi tidak ditemukan: " + missionId);
        if (!"QUEUED".equals(status)) throw new IllegalStateException("Hanya misi QUEUED yang bisa direassign; status saat ini: " + status);

        // Verify robot exists
        Integer count = db.queryForObject("SELECT count(*) FROM m_robot WHERE robot_id = ?", Integer.class, newRobotId);
        if (count == null || count == 0) throw new NoSuchElementException("Robot tidak ditemukan: " + newRobotId);

        // Reassign
        String agentName = safeAgent(operator);
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        db.update(
                "UPDATE t_mission SET status = 'CANCELLED', updated_at = ?, updated_by = ?, notes = CONCAT(COALESCE(notes, ''), '[REASSIGNED]') WHERE id = ?",
                now, agentName, missionId);
        // Re-enqueue under new robot
        db.update(
                "INSERT INTO t_mission (id, robot_id, status, created_by, request_code, compartment_no, simulated, created_at, updated_at, updated_by, notes) " +
                "VALUES (?, ?, 'QUEUED', COALESCE((SELECT created_by FROM t_mission WHERE id = ?), ?), " +
                "       (SELECT request_code FROM t_mission WHERE id = ?), " +
                "       (SELECT compartment_no FROM t_mission WHERE id = ?), " +
                "       (SELECT simulated FROM t_mission WHERE id = ?), " +
                "       (SELECT created_at FROM t_mission WHERE id = ?), ?, ?, " +
                "       CONCAT(COALESCE((SELECT notes FROM t_mission WHERE id = ?), ''), '[REASSIGNED]', ' ', ?)) " +
                "ON CONFLICT (id) DO UPDATE SET status='QUEUED', robot_id=excluded.robot_id, updated_at=excluded.updated_at",
                missionId, newRobotId, missionId, agentName, missionId, missionId, missionId, missionId,
                now, agentName, missionId, agentName);
        log.info("Reassign mission {} → robot {} by {}", missionId, newRobotId, agentName);
        return Map.of("reassigned", missionId.toString(), "toRobot", newRobotId, "reassignedBy", agentName, "at", now.toString());
    }

    /**
     * Batch reassign: list of {missionId, robotId} entries.
     * Returns per-item results (succeeded / error).
     */
    public List<Map<String, Object>> reassignBatch(List<Map<String, Object>> items, String operator) {
        if (items == null) throw new IllegalArgumentException("items wajib ada");
        String agent = safeAgent(operator);
        List<Map<String, Object>> results = new ArrayList<>();
        for (Map<String, Object> item : items) {
            Object idObj = item.get("missionId");
            Object robot = item.get("robotId");
            Map<String, Object> r = new LinkedHashMap<>();
            try {
                UUID missionId = idObj instanceof UUID u ? u : UUID.fromString(idObj.toString());
                if (robot == null || ((String) robot).isBlank()) {
                    r.put("missionId", missionId);
                    r.put("ok", false);
                    r.put("error", "robotId wajib diisi");
                } else {
                    Map<String, Object> result = reassignMission(missionId, robot.toString(), agent);
                    r.put("missionId", missionId);
                    r.put("ok", true);
                    r.putAll(result);
                }
            } catch (Exception e) {
                r.put("missionId", idObj);
                r.put("ok", false);
                r.put("error", e.getMessage());
            }
            results.add(r);
        }
        return results;
    }

    // ── internal ──────────────────────────────────────────────────────────────

    private void savePropsToDb() {
        // Persist to m_setting for config-sync across frontend sessions.
        // ponytail: saat ini hanya properti polling; tambahkan mapping fields lain ke kolom settings jika perlu.
        Map<String, Object> snapshot = getConfig();
        db.update("INSERT INTO m_setting (key_, value_, updated_at) VALUES (?, ?::jsonb, ?) " +
                        "ON CONFLICT (key_) DO UPDATE SET value_ = excluded.value_, updated_at = excluded.updated_at",
                "simrs.config", toJson(snapshot), OffsetDateTime.now(ZoneOffset.UTC));
        log.info("Simrs config persisted");
    }

    private String maskBaseUrl(String url) {
        if (url == null || url.isBlank()) return url;
        try {
            java.net.URI uri = java.net.URI.create(url);
            String scheme = uri.getScheme();
            String host = uri.getHost();
            int port = uri.getPort() < 0 ? (uri.getScheme().equals("https") ? 443 : 80) : uri.getPort();
            String path = uri.getPath() == null || uri.getPath().isBlank() ? "/" : uri.getPath();
            return scheme + "://" + host + ":" + port + path;
        } catch (Exception e) {
            return "[INVALID]" + url.substring(Math.max(0, url.length() - 20));
        }
    }

    private static String toJson(Map<String, Object> map) {
        // Inline minimal JSON (no dep added)
        StringBuilder sb = new StringBuilder();
        sb.append('{');
        boolean first = true;
        for (Map.Entry<String, Object> e : map.entrySet()) {
            if (!first) sb.append(',');
            first = false;
            sb.append('"').append(escape(e.getKey())).append('"');
            sb.append(':');
            if (e.getValue() == null) sb.append("null");
            else if (e.getValue() instanceof String s) sb.append('"').append(escape(s)).append('"');
            else sb.append(e.getValue());
        }
        sb.append('}');
        return sb.toString();
    }

    private static String escape(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n");
    }

    private static String stringFrom(Map<String, Object> map, String key) {
        Object v = map.get(key);
        return v instanceof String s ? s : null;
    }

    private static int toInt(Object v, int def) {
        try { return Integer.parseInt(v.toString()); } catch (Exception e) { return def; }
    }

    private static String safeAgent(String agent) {
        return agent != null ? agent : "admin";
    }
}
