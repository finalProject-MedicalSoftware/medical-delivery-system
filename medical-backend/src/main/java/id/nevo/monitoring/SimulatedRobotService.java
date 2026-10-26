package id.nevo.monitoring;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import jakarta.annotation.PreDestroy;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Robot Simulator & Navigation Dispatch Engine.
 * Fully compliant with PRD & Scaffold v2 guidelines:
 * - Clear [SIMULASI] labeling
 * - Distinct lifecycle states: SUBMITTED -> BACKEND_ACCEPTED -> ROBOT_ACKNOWLEDGED -> EXECUTING -> SUCCEEDED / FAILED / CANCELLED
 * - Real-time WebSocket telemetry broadcasting
 */
@Service
@EnableScheduling
public class SimulatedRobotService {
    private static final Logger log = LoggerFactory.getLogger(SimulatedRobotService.class);

    private final JdbcTemplate db;
    private final RobotWebSocketHandler wsHandler;
    private final SimrsClientService simrsService;

    // Robot state
    private final String robotId = "NEVO-01";
    private final String robotName = "Robot Pengantar Obat NEVO #1";
    private String status = "IDLE"; // IDLE, NAVIGATING, CHARGING, ERROR
    private final String mode = "AUTONOMOUS";
    private double battery = 96.5;
    private double currentX = -5.0;
    private double currentY = -5.0;
    private double currentYaw = 0.0;
    private double speed = 0.0;

    // Navigation tracking
    private UUID activeMissionId = null;
    private double startX = 0;
    private double startY = 0;
    private double targetX = 0;
    private double targetY = 0;
    private double targetYaw = 0;
    private double totalDistance = 0;
    private double traveledDistance = 0;

    // Routing fields for the WS bridge envelope (non-null: Map.of forbids nulls)
    private String activeRequestCode = "";
    private String activeWardCode = "";

    public SimulatedRobotService(JdbcTemplate db, RobotWebSocketHandler wsHandler, SimrsClientService simrsService) {
        this.db = db;
        this.wsHandler = wsHandler;
        this.simrsService = simrsService;
    }

    // ---- SIMRS write-path (fire-and-forget; kegagalan hanya di-log, tidak menghentikan robot) ----
    private final ExecutorService simrsWriter = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "simrs-writer");
        t.setDaemon(true);
        return t;
    });
    private Integer simrsCompartmentNo;

    @PreDestroy
    public void shutdownSimrsWriter() { simrsWriter.shutdown(); }

    private boolean simrsWriteLive() {
        try { return simrsService != null && simrsService.isWriteLive(); } catch (Exception ex) { return false; }
    }

    /** Dispatch (EXECUTING) -> SIMRS MOCK_IN_TRANSIT; tambah PENDING_INTEGRATION dulu bila SIMRS masih DELIVERY_REQUESTED (draf-D2). */
    private void postSimrsInTransit(UUID missionId, String requestCode, String roomCode) {
        if (!simrsWriteLive() || requestCode == null || requestCode.isBlank()) return;
        simrsWriter.submit(() -> {
            try {
                String current = findSimrsStatus(requestCode);
                if (current != null && (current.equals("MOCK_IN_TRANSIT") || current.equals("MOCK_ARRIVED_AT_ROOM") || current.equals("CANCELLED"))) {
                    log.info("SIMRS delivery {} sudah {}; lewati MOCK_IN_TRANSIT", requestCode, current);
                    return;
                }
                // Cache active-deliveries bisa stale (refresh tiap polling cycle), jadi
                // status null = belum terlihat -> perlakukan seperti DELIVERY_REQUESTED:
                // kirim PENDING_INTEGRATION dulu (kalau ternyata tidak ada, SIMRS
                // membalas 404/422 non-retryable dan tampil di log).
                if (current == null || current.equals("DELIVERY_REQUESTED")) {
                    doSimrsPost(missionId, requestCode, "PENDING_INTEGRATION", "[SIMULASI] Integrasi robot NEVO-01 mengambil permintaan pengantaran.", null);
                }
                doSimrsPost(missionId, requestCode, "MOCK_IN_TRANSIT", "[SIMULASI] Robot NEVO-01 dalam transit menuju ruang " + (roomCode == null ? "sasaran" : roomCode) + ".", null);
            } catch (Exception ex) {
                log.warn("Push status SIMRS (MOCK_IN_TRANSIT) gagal: {}", safeSimrsMessage(ex));
            }
        });
    }

    /** Arrival (SUCCEEDED) -> SIMRS MOCK_ARRIVED_AT_ROOM; serah-terima tetap manual lewat scan manusia di SIMRS. */
    private void postSimrsArrival(UUID missionId) {
        if (!simrsWriteLive()) return;
        simrsWriter.submit(() -> {
            try {
                Map<String, Object> mission = simrsMissionLookup(missionId);
                if (mission == null) { log.warn("Misi {} tidak ditemukan; laporan kedatangan SIMRS dilewati", missionId); return; }
                String requestCode = (String) mission.get("request_code");
                if (requestCode == null || requestCode.isBlank()) return;
                String roomCode = (String) mission.get("room_code");
                Integer compartment = simrsCompartmentNo;
                simrsCompartmentNo = null;
                doSimrsPost(missionId, requestCode, "MOCK_ARRIVED_AT_ROOM", "[SIMULASI] Robot NEVO-01 tiba di ruang " + (roomCode == null ? "sasaran" : roomCode) + "; serah-terima ditentukan via scan manusia.", compartment);
            } catch (Exception ex) {
                log.warn("Push status SIMRS (MOCK_ARRIVED_AT_ROOM) gagal: {}", safeSimrsMessage(ex));
            }
        });
    }

    /** Cancel -> SIMRS CANCELLED. */
    private void postSimrsCancel(UUID missionId) {
        if (!simrsWriteLive()) return;
        simrsWriter.submit(() -> {
            try {
                Map<String, Object> mission = simrsMissionLookup(missionId);
                if (mission == null) { log.warn("Misi {} tidak ditemukan; laporan pembatalan SIMRS dilewati", missionId); return; }
                String requestCode = (String) mission.get("request_code");
                if (requestCode == null || requestCode.isBlank()) return;
                simrsCompartmentNo = null;
                doSimrsPost(missionId, requestCode, "CANCELLED", "[SIMULASI] Misi pengantaran dibatalkan; robot kembali ke status siap.", null);
            } catch (Exception ex) {
                log.warn("Push status SIMRS (CANCELLED) gagal: {}", safeSimrsMessage(ex));
            }
        });
    }

    private void doSimrsPost(UUID missionId, String requestCode, String toStatus, String note, Integer compartmentNo) {
        String idempotencyKey = "m:" + missionId.toString().replace("-", "") + ":" + toStatus;
        Map<String, Object> result = simrsService.postDeliveryStatus(requestCode, toStatus, note, compartmentNo, idempotencyKey);
        Object http = result.get("httpStatus");
        int code = http instanceof Number n ? n.intValue() : 0;
        if (code >= 300) log.warn("POST delivery-status {} gagal: HTTP {} (requestCode={}, attempts={})", toStatus, code, requestCode, result.get("attempts"));
        else log.info("POST delivery-status {} terkirim (requestCode={}, attempts={})", toStatus, requestCode, result.get("attempts"));
    }

    private Map<String, Object> simrsMissionLookup(UUID missionId) {
        try {
            List<Map<String, Object>> rows = db.queryForList("SELECT request_code, room_code FROM t_mission WHERE id=?", missionId);
            return rows.isEmpty() ? null : rows.get(0);
        } catch (Exception ex) {
            log.warn("Lookup misi untuk SIMRS gagal: {}", safeSimrsMessage(ex));
            return null;
        }
    }

    /** Status current delivery di SIMRS dari cache poll 30 detik; null bila tidak ada / cache kosong. */
    private String findSimrsStatus(String requestCode) {
        try {
            for (Map<String, Object> delivery : simrsService.getActiveDeliveries()) {
                if (requestCode.equals(delivery.get("requestCode"))) return Objects.toString(delivery.get("status"), null);
            }
        } catch (Exception ex) {
            log.warn("Ambil status aktif SIMRS gagal: {}", safeSimrsMessage(ex));
        }
        return null;
    }

    private static String safeSimrsMessage(Exception ex) { return ex.getClass().getSimpleName(); }

    public Map<String, Object> getRobotState() {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("robotId", robotId);
        map.put("name", robotName);
        map.put("status", status);
        map.put("mode", mode);
        map.put("battery", Math.round(battery * 10.0) / 10.0);
        map.put("pose", Map.of("x", Math.round(currentX * 100.0) / 100.0, "y", Math.round(currentY * 100.0) / 100.0, "yaw", Math.round(currentYaw * 100.0) / 100.0));
        map.put("speed", speed);
        map.put("activeMissionId", activeMissionId);
        map.put("simulated", true);
        map.put("lastSeen", Instant.now().toString());
        return map;
    }

    public synchronized Map<String, Object> dispatchMission(UUID waypointId, String roomCode, String userName, String requestCode, Integer compartmentNo) {
        if ("NAVIGATING".equals(status)) {
            throw new IllegalStateException("Robot NEVO-01 sedang menjalankan misi aktif lain");
        }

        // Query waypoint coordinates
        var rows = db.queryForList("SELECT name, x, y, yaw, map_id FROM m_waypoint WHERE id=?", waypointId);
        if (rows.isEmpty()) {
            throw new IllegalArgumentException("Waypoint tidak ditemukan");
        }
        var wp = rows.get(0);
        String wpName = (String) wp.get("name");
        targetX = ((Number) wp.get("x")).doubleValue();
        targetY = ((Number) wp.get("y")).doubleValue();
        targetYaw = ((Number) wp.get("yaw")).doubleValue();

        UUID missionId = UUID.randomUUID();
        this.activeMissionId = missionId;
        this.startX = currentX;
        this.startY = currentY;
        this.totalDistance = Math.hypot(targetX - startX, targetY - startY);
        this.traveledDistance = 0;
        this.status = "NAVIGATING";
        this.speed = 0.55; // 0.55 m/s
        this.activeRequestCode = requestCode == null ? "" : requestCode;
        this.activeWardCode = resolveWardCode(roomCode);

        // 1. Record SUBMITTED
        db.update("INSERT INTO t_mission(id, robot_id, waypoint_id, room_code, created_by, status, request_code, simulated, created_at, updated_at) " +
                "VALUES (?, ?, ?, ?, ?, 'SUBMITTED', ?, true, now(), now())", missionId, robotId, waypointId, roomCode, userName, requestCode);
        db.update("INSERT INTO h_mission_event(mission_id, status, source, message) VALUES (?, 'SUBMITTED', 'OPERATOR', ?)",
                missionId, "Perintah navigasi diserahkan ke backend oleh " + userName);

        // 2. Transition BACKEND_ACCEPTED
        db.update("UPDATE t_mission SET status='BACKEND_ACCEPTED', updated_at=now() WHERE id=?", missionId);
        db.update("INSERT INTO h_mission_event(mission_id, status, source, message) VALUES (?, 'BACKEND_ACCEPTED', 'BACKEND', ?)",
                missionId, "Perintah divalidasi dan diterima oleh Server Monitoring NEVO");

        // 3. Transition ROBOT_ACKNOWLEDGED (SIMULASI)
        db.update("UPDATE t_mission SET status='ROBOT_ACKNOWLEDGED', updated_at=now() WHERE id=?", missionId);
        db.update("INSERT INTO h_mission_event(mission_id, status, source, message) VALUES (?, 'ROBOT_ACKNOWLEDGED', 'SIMULATED_ROBOT', ?)",
                missionId, "[SIMULASI] Robot menerima rencana rute menuju " + wpName);

        // 4. Transition EXECUTING
        db.update("UPDATE t_mission SET status='EXECUTING', updated_at=now() WHERE id=?", missionId);
        db.update("INSERT INTO h_mission_event(mission_id, status, source, message) VALUES (?, 'EXECUTING', 'SIMULATED_ROBOT', ?)",
                missionId, "[SIMULASI] Robot memulai navigasi otonom menuju titik sasaran");

        wsHandler.broadcast("MISSION_EVENT", Map.of(
                "missionId", missionId,
                "status", "EXECUTING",
                "progress", 0,
                "message", "Memulai perjalanan menuju " + wpName,
                "simulated", true,
                "requestCode", activeRequestCode,
                "wardCode", activeWardCode
        ));

        // Push status SIMRS (fire-and-forget; gagal tidak memblokir misi)
        this.simrsCompartmentNo = compartmentNo;
        postSimrsInTransit(missionId, requestCode, roomCode);

        return Map.of(
                "missionId", missionId,
                "robotId", robotId,
                "status", "EXECUTING",
                "targetWaypoint", wpName,
                "targetCoordinates", Map.of("x", targetX, "y", targetY, "yaw", targetYaw),
                "simulated", true
        );
    }

    /**
     * Ward code untuk routing channel WS. Direktori ruangan hanya terisi saat SIMRS live;
     * pada fase mock tabel kosong, jadi roomCode dipakai sebagai fallback.
     */
    private String resolveWardCode(String roomCode) {
        if (roomCode == null || roomCode.isBlank()) {
            return "";
        }
        try {
            var rows = db.queryForList("SELECT ward_code FROM m_simrs_room_directory WHERE room_code=?", roomCode);
            if (!rows.isEmpty()) {
                Object ward = rows.get(0).get("ward_code");
                if (ward instanceof String s && !s.isBlank()) {
                    return s;
                }
            }
        } catch (Exception e) {
            log.debug("[SIMULASI] ward_code tidak dapat diresolusi untuk room {}: {}", roomCode, e.getMessage());
        }
        return roomCode;
    }

    public synchronized Map<String, Object> cancelMission(UUID missionId, String userName) {
        if (activeMissionId == null || !activeMissionId.equals(missionId)) {
            throw new IllegalArgumentException("Misi tidak aktif atau tidak ditemukan");
        }

        this.status = "IDLE";
        this.speed = 0.0;
        this.activeMissionId = null;

        db.update("UPDATE t_mission SET status='CANCELLED', updated_at=now() WHERE id=?", missionId);
        db.update("INSERT INTO h_mission_event(mission_id, status, source, message) VALUES (?, 'CANCELLED', 'OPERATOR', ?)",
                missionId, "Misi dibatalkan oleh operator: " + userName);

        // Push pembatalan ke SIMRS (fire-and-forget)
        postSimrsCancel(missionId);

        wsHandler.broadcast("MISSION_EVENT", Map.of(
                "missionId", missionId,
                "status", "CANCELLED",
                "message", "Misi dibatalkan oleh pengguna",
                "simulated", true,
                "requestCode", activeRequestCode,
                "wardCode", activeWardCode
        ));

        return Map.of("missionId", missionId, "cancelled", true);
    }

    /**
     * Periodic simulation ticker running every 500 ms.
     * Moves robot smoothly along line to waypoint and broadcasts telemetry.
     */
    @Scheduled(fixedRate = 500)
    public void simulationTick() {
        if ("NAVIGATING".equals(status) && activeMissionId != null) {
            double dx = targetX - currentX;
            double dy = targetY - currentY;
            double distRemaining = Math.hypot(dx, dy);

            // Calculate angle towards target
            double angle = Math.atan2(dy, dx);
            currentYaw = angle;

            // Move step: speed (0.55 m/s) * 0.5s = ~0.275m
            double step = Math.min(speed * 0.5, distRemaining);
            currentX += Math.cos(angle) * step;
            currentY += Math.sin(angle) * step;
            traveledDistance += step;

            // Slight battery consumption
            battery = Math.max(battery - 0.02, 10.0);

            int progress = totalDistance > 0 ? (int) Math.min(Math.round((traveledDistance / totalDistance) * 100), 99) : 95;

            // Check arrival
            if (distRemaining <= 0.15) {
                currentX = targetX;
                currentY = targetY;
                currentYaw = targetYaw;
                status = "IDLE";
                speed = 0.0;
                UUID completedMissionId = activeMissionId;
                activeMissionId = null;

                db.update("UPDATE t_mission SET status='SUCCEEDED', updated_at=now() WHERE id=?", completedMissionId);
                db.update("INSERT INTO h_mission_event(mission_id, status, source, message) VALUES (?, 'SUCCEEDED', 'SIMULATED_ROBOT', ?)",
                        completedMissionId, "[SIMULASI] Robot berhasil tiba di titik tujuan.");

                wsHandler.broadcast("MISSION_EVENT", Map.of(
                        "missionId", completedMissionId,
                        "status", "SUCCEEDED",
                        "progress", 100,
                        "message", "Robot berhasil tiba di lokasi tujuan",
                        "simulated", true,
                        "requestCode", activeRequestCode,
                        "wardCode", activeWardCode
                ));

                // Push kedatangan ke SIMRS (fire-and-forget; serah-terima tetap manual via scan)
                postSimrsArrival(completedMissionId);
            } else {
                wsHandler.broadcast("MISSION_EVENT", Map.of(
                        "missionId", activeMissionId,
                        "status", "EXECUTING",
                        "progress", progress,
                        "currentPose", Map.of("x", currentX, "y", currentY, "yaw", currentYaw),
                        "simulated", true,
                        "requestCode", activeRequestCode,
                        "wardCode", activeWardCode
                ));
            }
        }

        // Broadcast telemetry heartbeat
        wsHandler.broadcast("TELEMETRY", getRobotState());
    }
}
