package id.nevo.monitoring;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.*;

@RestController
@RequestMapping("/api/v1")
public class MissionApi {

    private final JdbcTemplate db;
    private final SimulatedRobotService robotService;
    private final SimrsClientService simrsService;

    public MissionApi(JdbcTemplate db, SimulatedRobotService robotService, SimrsClientService simrsService) {
        this.db = db;
        this.robotService = robotService;
        this.simrsService = simrsService;
    }

    @GetMapping("/robots")
    public List<Map<String, Object>> getRobots() {
        return List.of(robotService.getRobotState());
    }

    @PostMapping("/missions")
    public Map<String, Object> createMission(@RequestBody MissionReq req, Authentication user) {
        if (req.waypointId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "waypointId wajib diisi");
        }
        try {
            return robotService.dispatchMission(req.waypointId(), req.roomCode(), user.getName(), req.requestCode());
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage());
        } catch (IllegalStateException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, e.getMessage());
        }
    }

    @GetMapping("/missions")
    public List<Map<String, Object>> getMissions(@RequestParam(value = "limit", defaultValue = "50") int limit) {
        return db.query(
                "SELECT m.id, m.robot_id, m.waypoint_id, m.room_code, m.created_by, m.status, m.request_code, " +
                        "m.simulated, m.created_at, m.updated_at, w.name as waypoint_name, w.x, w.y " +
                        "FROM missions m LEFT JOIN waypoints w ON m.waypoint_id = w.id " +
                        "ORDER BY m.created_at DESC LIMIT ?",
                (rs, rowNum) -> {
                    Map<String, Object> map = new LinkedHashMap<>();
                    map.put("id", rs.getObject("id"));
                    map.put("robotId", rs.getString("robot_id"));
                    map.put("waypointId", rs.getObject("waypoint_id"));
                    map.put("waypointName", rs.getString("waypoint_name"));
                    map.put("roomCode", rs.getString("room_code"));
                    map.put("targetCoordinates", Map.of("x", rs.getDouble("x"), "y", rs.getDouble("y")));
                    map.put("createdBy", rs.getString("created_by"));
                    map.put("status", rs.getString("status"));
                    map.put("requestCode", rs.getString("request_code"));
                    map.put("simulated", rs.getBoolean("simulated"));
                    map.put("createdAt", rs.getTimestamp("created_at"));
                    map.put("updatedAt", rs.getTimestamp("updated_at"));
                    return map;
                },
                limit
        );
    }

    @GetMapping("/missions/{id}")
    public Map<String, Object> getMissionDetail(@PathVariable UUID id) {
        var rows = db.query(
                "SELECT m.id, m.robot_id, m.waypoint_id, m.room_code, m.created_by, m.status, m.request_code, " +
                        "m.simulated, m.created_at, m.updated_at, w.name as waypoint_name, w.x, w.y " +
                        "FROM missions m LEFT JOIN waypoints w ON m.waypoint_id = w.id WHERE m.id = ?",
                (rs, rowNum) -> {
                    Map<String, Object> map = new LinkedHashMap<>();
                    map.put("id", rs.getObject("id"));
                    map.put("robotId", rs.getString("robot_id"));
                    map.put("waypointId", rs.getObject("waypoint_id"));
                    map.put("waypointName", rs.getString("waypoint_name"));
                    map.put("roomCode", rs.getString("room_code"));
                    map.put("targetCoordinates", Map.of("x", rs.getDouble("x"), "y", rs.getDouble("y")));
                    map.put("createdBy", rs.getString("created_by"));
                    map.put("status", rs.getString("status"));
                    map.put("requestCode", rs.getString("request_code"));
                    map.put("simulated", rs.getBoolean("simulated"));
                    map.put("createdAt", rs.getTimestamp("created_at"));
                    map.put("updatedAt", rs.getTimestamp("updated_at"));
                    return map;
                },
                id
        );

        if (rows.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Misi tidak ditemukan");
        }

        Map<String, Object> mission = new LinkedHashMap<>(rows.get(0));

        // Get mission events
        var events = db.query(
                "SELECT id, status, source, message, happened_at FROM mission_events WHERE mission_id = ? ORDER BY happened_at ASC",
                (rs, rowNum) -> Map.of(
                        "id", rs.getLong("id"),
                        "status", rs.getString("status"),
                        "source", rs.getString("source"),
                        "message", rs.getString("message"),
                        "happenedAt", rs.getTimestamp("happened_at")
                ),
                id
        );
        mission.put("events", events);
        return mission;
    }

    @PostMapping("/missions/{id}/cancel")
    public Map<String, Object> cancelMission(@PathVariable UUID id, Authentication user) {
        try {
            return robotService.cancelMission(id, user.getName());
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, e.getMessage());
        }
    }

    // SIMRS Integration endpoints
    @GetMapping("/integrations/simrs/status")
    public Map<String, Object> getSimrsStatus() {
        return simrsService.getConnectionStatus();
    }

    @PostMapping("/integrations/simrs/sync")
    public Map<String, Object> syncSimrs() {
        simrsService.pollAll();
        return simrsService.getConnectionStatus();
    }

    @GetMapping("/integrations/simrs/deliveries")
    public List<Map<String, Object>> getSimrsDeliveries() {
        return simrsService.getActiveDeliveries();
    }

    @GetMapping(value = "/integrations/simrs/mapping", produces = "application/yaml")
    public String getSimrsMapping() {
        String mapping = simrsService.getMappingYaml();
        if (mapping == null) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "SIMRS mapping tidak aktif atau belum dikonfigurasi");
        return mapping;
    }

    @GetMapping("/integrations/simrs/snapshot")
    public Object getSimrsSnapshot(@RequestParam(required = false) String since,
                                  @RequestParam(defaultValue = "200") int limit) {
        if (limit < 1 || limit > 200) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "limit harus 1..200");
        return simrsService.getSnapshot(since, limit);
    }

    @GetMapping("/integrations/simrs/patient/{mrn}")
    public Object getSimrsPatient(@PathVariable String mrn) {
        return simrsService.getPatient(mrn);
    }

    @PostMapping("/integrations/simrs/delivery-status")
    public Map<String, Object> updateDeliveryStatus(@RequestBody DeliveryStatusReq req) {
        try {
            return simrsService.postDeliveryStatus(req.requestCode(), req.toStatus(), req.note(), req.compartmentNo(), req.idempotencyKey());
        } catch (IllegalArgumentException e) {
            if (e.getMessage() != null && e.getMessage().contains("serah-terima")) {
                throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, e.getMessage());
            }
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage());
        } catch (IllegalStateException e) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, e.getMessage());
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, e.getMessage());
        }
    }

    public record MissionReq(UUID waypointId, String roomCode, String requestCode) {}
    public record DeliveryStatusReq(String requestCode, String toStatus, String note, Integer compartmentNo, String idempotencyKey) {}
}
