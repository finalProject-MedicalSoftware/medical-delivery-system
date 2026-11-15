package id.nevo.monitoring;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.*;

/**
 * Adapter mode ROBOT_MODE=real (kontrak docs/api-contracts/robot-command.md, aktif 3/11/2026):
 * perintah downlink DITERUSKAN ke robot fisik lewat gateway medical-ws (TIFA) via
 * POST /internal/publish — tidak ada simulasi di sini.
 *
 * ponytail: hasil eksekusi robot (ROBOT_COMMAND_RESULT) naik via Kafka+WS saja;
 * backend belum punya konsumen Kafka, jadi t_robot_command.result tetap null
 * untuk perintah yang diteruskan, sampai konsumen uplink diimplementasi.
 */
@Service
@ConditionalOnExpression("'${nevo.robot.mode:sim}' == 'real'")
public class RealRobotAdapter implements RobotAdapter {
    private static final Logger log = LoggerFactory.getLogger(RealRobotAdapter.class);
    private static final ObjectMapper JSON = new ObjectMapper();

    // HTTP_1_1: gateway Node/ws menolak header h2c (lihat InternalPublisher).
    private final HttpClient http = HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_1_1)
            .build();

    private final JdbcTemplate db;
    private final InternalPublisher publisher;
    private final String gatewayUrl;
    private final String secret;

    public RealRobotAdapter(JdbcTemplate db,
                            InternalPublisher publisher,
                            @Value("${nevo.gateway.url:}") String gatewayUrl,
                            @Value("${nevo.internal-publish.secret:}") String secret) {
        this.db = db;
        this.publisher = publisher;
        this.gatewayUrl = gatewayUrl;
        this.secret = secret;
    }

    @Override
    public List<Map<String, Object>> getRobots() {
        requireConfigured();
        Set<String> connected = fetchConnectedRobots();
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> row : db.queryForList("SELECT robot_id, name, registration_status FROM m_robot ORDER BY robot_id")) {
            String rid = (String) row.get("robot_id");
            String registration = (String) row.get("registration_status");
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("robotId", rid);
            m.put("name", row.get("name"));
            String connection = connected == null ? "UNKNOWN" :
                    connected.contains(rid) ? "ONLINE" : "OFFLINE";
            m.put("connectionStatus", connection);
            m.put("status", "ONLINE".equals(connection) ? "UNKNOWN" : connection);
            m.put("registrationStatus", registration);
            m.put("activeMissionId", null);
            m.put("simulated", false);
            out.add(m);
        }
        return out;
    }

    @Override
    public void executeCommand(UUID commandId, String robotId, String command, String userName, Map<String, Object> params) {
        requireConfigured();
        try {
            // Insert dengan PK commandId: perintah ulang diabaikan, bukan dieksekusi dua kali (kontrak §5).
            db.update("INSERT INTO t_robot_command(command_id, robot_id, command, params, user_name) VALUES (?, ?, ?, ?::jsonb, ?)",
                    commandId, robotId, command, writeJson(params), userName);
        } catch (DuplicateKeyException e) {
            return;
        }

        // Validasi di sisi backend agar perintah di luar batas kontrak tidak pernah
        // sampai ke robot fisik (robot juga memvalidasi — defense in depth).
        String reason = validate(command, params);
        if (!reason.isEmpty()) {
            reject(commandId, robotId, reason);
            return;
        }

        try {
            publisher.publishCommandChecked(Map.of(
                    "commandId", commandId,
                    "robotId", robotId,
                    "command", command,
                    "issuedBy", userName == null ? "" : userName,
                    "params", params == null ? Map.of() : params));
        } catch (ResponseStatusException e) {
            db.update("UPDATE t_robot_command SET status='UNKNOWN', reason_code='GATEWAY_RESPONSE_UNKNOWN', finished_at=now() WHERE command_id=?", commandId);
            throw e;
        }
    }

    private void requireConfigured() {
        if (!publisher.isConfigured() || gatewayUrl == null || gatewayUrl.isBlank()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Mode real butuh INTERNAL_PUBLISH_URL/INTERNAL_PUBLISH_SECRET dan GATEWAY_URL terkonfigurasi");
        }
    }

    /** null = gateway unavailable; never infer physical readiness from a socket roster. */
    private Set<String> fetchConnectedRobots() {
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(gatewayUrl + "/internal/robots"))
                    .timeout(Duration.ofSeconds(2))
                    .header("X-Internal-Secret", secret)
                    .GET()
                    .build();
            HttpResponse<String> res = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() != 200) return null;
            JsonNode arr = JSON.readTree(res.body()).path("robots");
            if (!arr.isArray()) return null;
            Set<String> ids = new HashSet<>();
            for (JsonNode n : arr) {
                if (!n.isTextual()) return null;
                ids.add(n.asText());
            }
            return ids;
        } catch (Exception e) {
            log.warn("Gagal mengambil daftar robot dari gateway: {}", e.getMessage());
            return null;
        }
    }

    /** Batas kontrak robot-command.md §6: speed 0..2, teleop linear ±1, angular ±2. Kosong = lolos. */
    private static String validate(String command, Map<String, Object> params) {
        try {
            switch (command) {
                case "CMD_SET_SPEED" -> {
                    double speed = number(params, "speed");
                    if (speed < 0 || speed > 2.0) return "INVALID_PARAMS";
                }
                case "CMD_TELEOP_DRIVE" -> {
                    if (Math.abs(number(params, "linear")) > 1.0 || Math.abs(number(params, "angular")) > 2.0) {
                        return "INVALID_PARAMS";
                    }
                }
                case "CMD_CANCEL_MISSION", "CMD_RETURN_TO_DOCK" -> { /* diteruskan; state misi milik robot */ }
                default -> { return "INVALID_PARAMS"; }
            }
        } catch (Exception e) {
            return "INVALID_PARAMS";
        }
        return "";
    }

    /** Penolakan di sisi backend (belum sampai robot): tandai baris + kabari UI via ROBOT_COMMAND_RESULT. */
    private void reject(UUID commandId, String robotId, String reason) {
        db.update("UPDATE t_robot_command SET status='REJECTED', reason_code=?, finished_at=now() WHERE command_id=?",
                reason, commandId);
        publisher.publishCommand("ROBOT_COMMAND_RESULT", Map.of(
                "commandId", commandId, "robotId", robotId, "result", "REJECTED", "reason", reason));
    }

    private static double number(Map<String, Object> params, String key) {
        Object raw = params == null ? null : params.get(key);
        if (raw instanceof Number n) return n.doubleValue();
        try { return Double.parseDouble(Objects.toString(raw)); }
        catch (Exception e) { throw new IllegalArgumentException(key + " wajib angka"); }
    }

    private static String writeJson(Map<String, Object> params) {
        try { return JSON.writeValueAsString(params == null ? Map.of() : params); }
        catch (Exception e) { return "{}"; }
    }
}
