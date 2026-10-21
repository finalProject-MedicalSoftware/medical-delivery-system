package id.nevo.monitoring;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

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

    public SimulatedRobotService(JdbcTemplate db, RobotWebSocketHandler wsHandler) {
        this.db = db;
        this.wsHandler = wsHandler;
    }

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

    public synchronized Map<String, Object> dispatchMission(UUID waypointId, String roomCode, String userName, String requestCode) {
        if ("NAVIGATING".equals(status)) {
            throw new IllegalStateException("Robot NEVO-01 sedang menjalankan misi aktif lain");
        }

        // Query waypoint coordinates
        var rows = db.queryForList("SELECT name, x, y, yaw, map_id FROM waypoints WHERE id=?", waypointId);
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

        // 1. Record SUBMITTED
        db.update("INSERT INTO missions(id, robot_id, waypoint_id, room_code, created_by, status, request_code, simulated, created_at, updated_at) " +
                "VALUES (?, ?, ?, ?, ?, 'SUBMITTED', ?, true, now(), now())", missionId, robotId, waypointId, roomCode, userName, requestCode);
        db.update("INSERT INTO mission_events(mission_id, status, source, message) VALUES (?, 'SUBMITTED', 'OPERATOR', ?)",
                missionId, "Perintah navigasi diserahkan ke backend oleh " + userName);

        // 2. Transition BACKEND_ACCEPTED
        db.update("UPDATE missions SET status='BACKEND_ACCEPTED', updated_at=now() WHERE id=?", missionId);
        db.update("INSERT INTO mission_events(mission_id, status, source, message) VALUES (?, 'BACKEND_ACCEPTED', 'BACKEND', ?)",
                missionId, "Perintah divalidasi dan diterima oleh Server Monitoring NEVO");

        // 3. Transition ROBOT_ACKNOWLEDGED (SIMULASI)
        db.update("UPDATE missions SET status='ROBOT_ACKNOWLEDGED', updated_at=now() WHERE id=?", missionId);
        db.update("INSERT INTO mission_events(mission_id, status, source, message) VALUES (?, 'ROBOT_ACKNOWLEDGED', 'SIMULATED_ROBOT', ?)",
                missionId, "[SIMULASI] Robot menerima rencana rute menuju " + wpName);

        // 4. Transition EXECUTING
        db.update("UPDATE missions SET status='EXECUTING', updated_at=now() WHERE id=?", missionId);
        db.update("INSERT INTO mission_events(mission_id, status, source, message) VALUES (?, 'EXECUTING', 'SIMULATED_ROBOT', ?)",
                missionId, "[SIMULASI] Robot memulai navigasi otonom menuju titik sasaran");

        wsHandler.broadcast("MISSION_EVENT", Map.of(
                "missionId", missionId,
                "status", "EXECUTING",
                "progress", 0,
                "message", "Memulai perjalanan menuju " + wpName,
                "simulated", true
        ));

        return Map.of(
                "missionId", missionId,
                "robotId", robotId,
                "status", "EXECUTING",
                "targetWaypoint", wpName,
                "targetCoordinates", Map.of("x", targetX, "y", targetY, "yaw", targetYaw),
                "simulated", true
        );
    }

    public synchronized Map<String, Object> cancelMission(UUID missionId, String userName) {
        if (activeMissionId == null || !activeMissionId.equals(missionId)) {
            throw new IllegalArgumentException("Misi tidak aktif atau tidak ditemukan");
        }

        this.status = "IDLE";
        this.speed = 0.0;
        this.activeMissionId = null;

        db.update("UPDATE missions SET status='CANCELLED', updated_at=now() WHERE id=?", missionId);
        db.update("INSERT INTO mission_events(mission_id, status, source, message) VALUES (?, 'CANCELLED', 'OPERATOR', ?)",
                missionId, "Misi dibatalkan oleh operator: " + userName);

        wsHandler.broadcast("MISSION_EVENT", Map.of(
                "missionId", missionId,
                "status", "CANCELLED",
                "message", "Misi dibatalkan oleh pengguna",
                "simulated", true
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

                db.update("UPDATE missions SET status='SUCCEEDED', updated_at=now() WHERE id=?", completedMissionId);
                db.update("INSERT INTO mission_events(mission_id, status, source, message) VALUES (?, 'SUCCEEDED', 'SIMULATED_ROBOT', ?)",
                        completedMissionId, "[SIMULASI] Robot berhasil tiba di titik tujuan.");

                wsHandler.broadcast("MISSION_EVENT", Map.of(
                        "missionId", completedMissionId,
                        "status", "SUCCEEDED",
                        "progress", 100,
                        "message", "Robot berhasil tiba di lokasi tujuan",
                        "simulated", true
                ));
            } else {
                wsHandler.broadcast("MISSION_EVENT", Map.of(
                        "missionId", activeMissionId,
                        "status", "EXECUTING",
                        "progress", progress,
                        "currentPose", Map.of("x", currentX, "y", currentY, "yaw", currentYaw),
                        "simulated", true
                ));
            }
        }

        // Broadcast telemetry heartbeat
        wsHandler.broadcast("TELEMETRY", getRobotState());
    }
}
