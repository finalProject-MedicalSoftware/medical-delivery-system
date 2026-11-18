package id.nevo.monitoring;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Siklus misi pengantaran untuk robot FISIK (ROBOT_MODE=real). Menggantikan SimulatedRobotService
 * di jalur manifest: satu manifest = satu perintah OP ke robot (tray_tasks berurutan), lalu
 * status misi digerakkan oleh uplink robot yang diteruskan gateway ke /internal/robot-events:
 *   ACK OP ENQUEUED -> EXECUTING + SIMRS IN_TRANSIT
 *   GOAL_COMPLETE n -> misi ke-n SUCCEEDED + SIMRS ARRIVED_AT_ROOM (serah-terima tetap oleh manusia)
 * Pemetaan: GOAL_COMPLETE.sequence = manifest_sequence (robot menomori tray_tasks dari 1).
 */
@Service
@ConditionalOnExpression("'${nevo.robot.mode:sim}' == 'real'")
public class RealMissionService {
    private static final Logger log = LoggerFactory.getLogger(RealMissionService.class);
    private static final String ACTIVE = "('BACKEND_ACCEPTED','ROBOT_ACKNOWLEDGED','EXECUTING')";

    /** Satu tujuan hasil validasi MissionPlanningService. */
    public record Stop(UUID waypointId, String roomCode, String bedId, String patientMrn, String requestCode,
                       Integer compartmentNo, Instant placementUpdatedAt, String source) { }

    private final JdbcTemplate db;
    private final InternalPublisher publisher;
    private final SimrsClientService simrs;
    private final int compartmentCount;
    private final int missionTimeoutMinutes;
    private final String homeBase;
    private final ExecutorService simrsWriter = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "real-mission-simrs-writer");
        t.setDaemon(true);
        return t;
    });

    public RealMissionService(JdbcTemplate db, InternalPublisher publisher, SimrsClientService simrs,
                              @Value("${nevo.robot.compartment-count:6}") int compartmentCount,
                              @Value("${nevo.robot.mission-timeout-minutes:60}") int missionTimeoutMinutes,
                              @Value("${nevo.robot.home-base:}") String homeBase) {
        this.db = db;
        this.publisher = publisher;
        this.simrs = simrs;
        this.compartmentCount = compartmentCount;
        this.missionTimeoutMinutes = missionTimeoutMinutes;
        this.homeBase = homeBase;
    }

    public int getCompartmentCount() { return compartmentCount; }

    /** Robot harus terdaftar VERIFIED dan tidak sedang menjalankan misi lain. */
    public void requireDispatchable(String robotId) {
        List<String> reg = db.queryForList("SELECT registration_status FROM m_robot WHERE robot_id=?", String.class, robotId);
        if (reg.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Robot tidak terdaftar");
        if (!"VERIFIED".equals(reg.get(0))) throw new ResponseStatusException(HttpStatus.CONFLICT, "Robot belum terverifikasi untuk operasi fisik");
        // Misi macet (robot mati/restart) tidak boleh mengunci robot selamanya.
        db.update("UPDATE t_mission SET status='UNKNOWN', updated_at=now() WHERE robot_id=? AND status IN " + ACTIVE +
                " AND updated_at < now() - make_interval(mins => ?)", robotId, missionTimeoutMinutes);
        Integer busy = db.queryForObject("SELECT count(*) FROM t_mission WHERE robot_id=? AND status IN " + ACTIVE, Integer.class, robotId);
        if (busy != null && busy > 0) throw new ResponseStatusException(HttpStatus.CONFLICT, "Robot masih menjalankan misi sebelumnya");
    }

    /** Buat misi tiap tujuan lalu kirim SATU perintah OP ke robot lewat gateway. */
    public Map<String, Object> dispatchManifest(String robotId, List<Stop> stops, String userName, UUID manifestId) {
        List<Map<String, Object>> missions = new ArrayList<>();
        List<Map<String, Object>> trayTasks = new ArrayList<>();
        List<UUID> ids = new ArrayList<>();
        for (int i = 0; i < stops.size(); i++) {
            Stop s = stops.get(i);
            Map<String, Object> wp = db.queryForList("SELECT name, x, y, yaw FROM m_waypoint WHERE id=?", s.waypointId())
                    .stream().findFirst().orElseThrow(() -> new IllegalArgumentException("Waypoint tidak ditemukan"));
            UUID missionId = UUID.randomUUID();
            ids.add(missionId);
            db.update("INSERT INTO t_mission(id, robot_id, waypoint_id, room_code, created_by, status, request_code, simulated, manifest_id, manifest_sequence, patient_mrn, bed_id, placement_updated_at, mission_source, created_at, updated_at) " +
                            "VALUES (?, ?, ?, ?, ?, 'SUBMITTED', ?, false, ?, ?, ?, ?, ?, ?, now(), now())",
                    missionId, robotId, s.waypointId(), s.roomCode(), userName, s.requestCode(), manifestId, i + 1, s.patientMrn(), s.bedId(),
                    s.placementUpdatedAt() == null ? null : java.sql.Timestamp.from(s.placementUpdatedAt()), s.source());
            event(missionId, "SUBMITTED", "OPERATOR", "Manifest diserahkan ke backend oleh " + userName);
            db.update("UPDATE t_mission SET status='BACKEND_ACCEPTED', updated_at=now() WHERE id=?", missionId);
            event(missionId, "BACKEND_ACCEPTED", "BACKEND", "Manifest divalidasi; menunggu robot fisik " + robotId);
            if (s.compartmentNo() != null) {
                db.update("INSERT INTO t_delivery_compartment(id, mission_id, compartment_no, patient_mrn, filled_at) VALUES (?, ?, ?, ?, now())",
                        UUID.randomUUID(), missionId, s.compartmentNo(), s.patientMrn());
            }
            Map<String, Object> dest = new LinkedHashMap<>();
            dest.put("x", ((Number) wp.get("x")).doubleValue());
            dest.put("y", ((Number) wp.get("y")).doubleValue());
            dest.put("yaw", ((Number) wp.get("yaw")).doubleValue());
            trayTasks.add(Map.of("tray", s.compartmentNo() == null ? 0 : s.compartmentNo(), "dest", dest, "goalId", i + 1));
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("missionId", missionId);
            m.put("robotId", robotId);
            m.put("targetWaypoint", wp.get("name"));
            m.put("targetCoordinates", dest);
            m.put("compartmentNo", s.compartmentNo());
            m.put("status", "BACKEND_ACCEPTED");
            m.put("simulated", false);
            missions.add(m);
        }

        Map<String, Object> params = new LinkedHashMap<>();
        params.put("trayTasks", trayTasks);
        Map<String, Object> home = parseHomeBase(homeBase);
        if (home != null) params.put("homeBase", home);
        try {
            publisher.publishCommandChecked(Map.of(
                    "commandId", UUID.randomUUID(), "robotId", robotId, "command", "CMD_DISPATCH_OP",
                    "issuedBy", userName == null ? "" : userName, "params", params));
        } catch (ResponseStatusException e) {
            for (UUID id : ids) {
                db.update("UPDATE t_mission SET status='FAILED', updated_at=now() WHERE id=?", id);
                event(id, "FAILED", "GATEWAY", "Perintah OP tidak sampai ke robot: " + e.getReason());
            }
            throw e;
        }
        for (UUID id : ids) event(id, "BACKEND_ACCEPTED", "GATEWAY", "Perintah OP dikirim ke robot " + robotId + " (menunggu ACK)");
        return Map.of("manifestId", manifestId, "status", "ACCEPTED", "missions", missions);
    }

    /** Uplink robot (diteruskan gateway). Idempotent: hanya transisi dari status yang sesuai yang diproses. */
    public void onRobotEvent(String code, Map<String, Object> data) {
        if (code == null || data == null) return;
        String robotId = Objects.toString(data.get("robot_id"), "");
        if (robotId.isBlank()) return;
        switch (code) {
            case "ACK" -> {
                if (!"OP".equals(data.get("command_id"))) return;
                String status = Objects.toString(data.get("status"), "");
                if ("ENQUEUED".equals(status)) started(robotId);
                else if ("REJECTED".equals(status) || "IGNORED".equals(status)) failPending(robotId, "Robot menolak OP (" + status + ")");
            }
            case "GOAL_COMPLETE" -> {
                Object seq = data.get("sequence");
                if (seq instanceof Number n && n.intValue() >= 1) arrived(robotId, n.intValue());
            }
            case "ERROR" -> {
                String msg = Objects.toString(data.get("error_message"), "");
                if (msg.startsWith("OP rejected")) failPending(robotId, "Robot menolak OP: " + msg);
                else note(robotId, "Robot melaporkan error " + data.get("error_code") + ": " + msg);
            }
            case "ROBOT_STUCK" -> note(robotId, "Robot tersangkut: " + data.get("reason"));
            case "PICKUP_CONFIRM" -> {
                Object seq = data.get("sequence");
                if (seq instanceof Number n) pickup(robotId, n.intValue(), !Boolean.FALSE.equals(data.get("collected")),
                        Objects.toString(data.get("method"), "UNKNOWN"));
            }
            default -> { }
        }
    }

    /** Operator membatalkan: semua misi aktif robot jadi CANCELLED dan SIMRS diberi tahu. */
    public void cancelActive(String robotId, String userName) {
        for (Map<String, Object> m : activeMissions(robotId, ACTIVE)) {
            UUID id = (UUID) m.get("id");
            db.update("UPDATE t_mission SET status='CANCELLED', updated_at=now() WHERE id=?", id);
            event(id, "CANCELLED", "OPERATOR", "Misi dibatalkan oleh " + userName);
            broadcast(m, "CANCELLED", "Misi dibatalkan oleh operator");
            postSimrs(id, (String) m.get("request_code"), "CANCELLED", "Misi pengantaran dibatalkan oleh operator " + userName, null);
        }
    }

    private void started(String robotId) {
        for (Map<String, Object> m : activeMissions(robotId, "('BACKEND_ACCEPTED','ROBOT_ACKNOWLEDGED')")) {
            UUID id = (UUID) m.get("id");
            db.update("UPDATE t_mission SET status='ROBOT_ACKNOWLEDGED', updated_at=now() WHERE id=? AND status='BACKEND_ACCEPTED'", id);
            event(id, "ROBOT_ACKNOWLEDGED", "ROBOT", "Robot " + robotId + " menerima rute");
            db.update("UPDATE t_mission SET status='EXECUTING', updated_at=now() WHERE id=?", id);
            event(id, "EXECUTING", "ROBOT", "Robot memulai navigasi");
            broadcast(m, "EXECUTING", "Robot memulai perjalanan");
            postSimrs(id, (String) m.get("request_code"), "IN_TRANSIT", "Robot " + robotId + " dalam perjalanan ke ruang " + m.get("room_code"), null);
        }
    }

    private void arrived(String robotId, int sequence) {
        List<Map<String, Object>> rows = db.queryForList(
                "SELECT m.id, m.request_code, m.room_code, (SELECT dc.compartment_no FROM t_delivery_compartment dc WHERE dc.mission_id=m.id ORDER BY dc.compartment_no LIMIT 1) AS compartment_no " +
                        "FROM t_mission m WHERE m.robot_id=? AND m.status='EXECUTING' AND m.manifest_sequence=? ORDER BY m.created_at DESC LIMIT 1", robotId, sequence);
        if (rows.isEmpty()) { log.info("GOAL_COMPLETE seq={} robot={} tanpa misi EXECUTING; diabaikan", sequence, robotId); return; }
        Map<String, Object> m = rows.get(0);
        UUID id = (UUID) m.get("id");
        if (db.update("UPDATE t_mission SET status='SUCCEEDED', updated_at=now() WHERE id=? AND status='EXECUTING'", id) == 0) return;
        event(id, "SUCCEEDED", "ROBOT", "Robot tiba di tujuan; menunggu serah-terima oleh manusia");
        broadcast(m, "SUCCEEDED", "Robot berhasil tiba di lokasi tujuan");
        Integer compartment = m.get("compartment_no") instanceof Number n ? n.intValue() : null;
        postSimrs(id, (String) m.get("request_code"), "ARRIVED_AT_ROOM", "Robot " + robotId + " tiba di ruang " + m.get("room_code") + "; serah-terima oleh manusia.", compartment);
    }

    /** Hasil pengambilan di tujuan: collected=false (timeout, obat masih di kompartemen) -> SIMRS NOT_COLLECTED. */
    private void pickup(String robotId, int sequence, boolean collected, String method) {
        List<Map<String, Object>> rows = db.queryForList(
                "SELECT m.id, m.request_code, m.room_code FROM t_mission m WHERE m.robot_id=? AND m.status='SUCCEEDED' AND m.manifest_sequence=? ORDER BY m.updated_at DESC LIMIT 1",
                robotId, sequence);
        if (rows.isEmpty()) { log.info("PICKUP_CONFIRM seq={} robot={} tanpa misi SUCCEEDED; diabaikan", sequence, robotId); return; }
        Map<String, Object> m = rows.get(0);
        UUID id = (UUID) m.get("id");
        if (collected) {
            event(id, "SUCCEEDED", "ROBOT", "Obat diambil (" + method + ")");
            return;
        }
        event(id, "SUCCEEDED", "ROBOT", "Obat TIDAK diambil sampai batas waktu (" + method + "); robot membawa obat kembali");
        broadcast(m, "SUCCEEDED", "Obat tidak diambil; perawat diberi tahu");
        postSimrs(id, (String) m.get("request_code"), "NOT_COLLECTED", "Obat tidak diambil di ruang " + m.get("room_code") + "; robot membawa obat kembali.", null);
    }

    private void failPending(String robotId, String reason) {
        for (Map<String, Object> m : activeMissions(robotId, "('BACKEND_ACCEPTED','ROBOT_ACKNOWLEDGED')")) {
            UUID id = (UUID) m.get("id");
            db.update("UPDATE t_mission SET status='FAILED', updated_at=now() WHERE id=?", id);
            event(id, "FAILED", "ROBOT", reason);
            broadcast(m, "FAILED", reason);
        }
    }

    private void note(String robotId, String message) {
        for (Map<String, Object> m : activeMissions(robotId, "('EXECUTING')")) event((UUID) m.get("id"), "EXECUTING", "ROBOT", message);
    }

    private List<Map<String, Object>> activeMissions(String robotId, String statusList) {
        return db.queryForList("SELECT id, request_code, room_code FROM t_mission WHERE robot_id=? AND status IN " + statusList + " ORDER BY manifest_sequence NULLS LAST, created_at", robotId);
    }

    private void event(UUID missionId, String status, String source, String message) {
        db.update("INSERT INTO h_mission_event(mission_id, status, source, message) VALUES (?, ?::mission_status, ?, ?)", missionId, status, source, message);
    }

    private void broadcast(Map<String, Object> mission, String status, String message) {
        String room = (String) mission.get("room_code");
        String ward = "";
        if (room != null && !room.isBlank()) {
            try {
                List<String> w = db.queryForList("SELECT ward_code FROM m_simrs_room_directory WHERE room_code=?", String.class, room);
                if (!w.isEmpty() && w.get(0) != null) ward = w.get(0);
            } catch (Exception ignored) { /* direktori belum tersedia: wardCode kosong => tidak dirutekan */ }
        }
        String rc = mission.get("request_code") == null ? "" : mission.get("request_code").toString();
        publisher.publish("MISSION_EVENT", Map.of("missionId", mission.get("id"), "status", status, "message", message,
                "simulated", false, "requestCode", rc, "wardCode", ward));
    }

    private void postSimrs(UUID missionId, String requestCode, String toStatus, String note, Integer compartmentNo) {
        if (requestCode == null || requestCode.isBlank() || !simrs.isWriteLive()) return;
        simrsWriter.submit(() -> {
            try {
                String key = "m:" + missionId.toString().replace("-", "") + ":" + toStatus;
                Map<String, Object> r = simrs.postDeliveryStatus(requestCode, toStatus, note, compartmentNo, key);
                log.info("POST delivery-status {} requestCode={} -> {}", toStatus, requestCode, r.get("httpStatus"));
            } catch (Exception ex) {
                log.warn("Push status SIMRS ({}) gagal: {}", toStatus, ex.getClass().getSimpleName());
            }
        });
    }

    /** "x,y,yaw" (meter,meter,radian) -> peta; kosong/rusak -> null (robot tidak diperintah pulang otomatis). */
    static Map<String, Object> parseHomeBase(String raw) {
        if (raw == null || raw.isBlank()) return null;
        String[] p = raw.split(",");
        if (p.length != 3) return null;
        try {
            return Map.of("x", Double.parseDouble(p[0].trim()), "y", Double.parseDouble(p[1].trim()), "yaw", Double.parseDouble(p[2].trim()));
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
