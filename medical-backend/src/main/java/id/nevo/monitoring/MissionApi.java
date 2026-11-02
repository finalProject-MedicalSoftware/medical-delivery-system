package id.nevo.monitoring;

import id.nevo.monitoring.admin.SimrsAdminService;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.*;

@RestController
@RequestMapping("/api/v1")
public class MissionApi {

    private final JdbcTemplate db;
    // Legacy mission lifecycle remains simulator-only until a complete navigation adapter exists.
    private final SimulatedRobotService robotService;
    private final RobotAdapter robotAdapter;
    private final SimrsClientService simrsService;
    private final SimrsAdminService adminService;

    public MissionApi(JdbcTemplate db, ObjectProvider<SimulatedRobotService> robotService, RobotAdapter robotAdapter, SimrsClientService simrsService, SimrsAdminService adminService) {
        this.db = db;
        this.robotService = robotService.getIfAvailable();
        this.robotAdapter = robotAdapter;
        this.simrsService = simrsService;
        this.adminService = adminService;
    }

    @GetMapping("/robots")
    public List<Map<String, Object>> getRobots() {
        return robotAdapter.getRobots();
    }

    private static final Set<String> ROBOT_COMMANDS = Set.of(
            "CMD_CANCEL_MISSION", "CMD_RETURN_TO_DOCK", "CMD_TELEOP_DRIVE", "CMD_SET_SPEED");

    /** Perintah downlink (kontrak docs/api-contracts/robot-command.md §6); hasil dikirim via WS ROBOT_COMMAND_RESULT. */
    @PostMapping("/robots/{robotId}/commands")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public Map<String, Object> sendCommand(@PathVariable String robotId, @RequestBody CommandReq req, Authentication user) {
        if (req == null || req.command() == null || !ROBOT_COMMANDS.contains(req.command())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "command tidak dikenal");
        }
        Integer count = db.queryForObject("SELECT count(*) FROM m_robot WHERE robot_id = ?", Integer.class, robotId);
        if (count == null || count == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Robot tidak ditemukan");
        }
        UUID commandId = UUID.randomUUID();
        robotAdapter.executeCommand(commandId, robotId, req.command(), user.getName(), req.params() == null ? Map.of() : req.params());
        return Map.of("commandId", commandId.toString(), "simulated", robotAdapter == robotService);
    }

    @PostMapping("/missions")
    public Map<String, Object> createMission(@RequestBody MissionReq req, Authentication user) {
        if (req.waypointId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "waypointId wajib diisi");
        }
        try {
            return simulator().dispatchMission(req.waypointId(), req.roomCode(), user.getName(), req.requestCode(), req.compartmentNo());
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage());
        } catch (IllegalStateException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, e.getMessage());
        }
    }

    private static final String MISSION_SELECT =
            "SELECT m.id, m.robot_id, m.waypoint_id, m.room_code, m.created_by, m.status, m.request_code, " +
                    "m.simulated, m.created_at, m.updated_at, w.name as waypoint_name, w.x, w.y, " +
                    "(SELECT dc.compartment_no FROM t_delivery_compartment dc WHERE dc.mission_id = m.id " +
                    " ORDER BY dc.compartment_no LIMIT 1) as compartment_no, " +
                    "c.payload->'patient'->>'fullName' as patient_name, " +
                    "COALESCE(c.payload->'patient'->>'roomName', c.payload->>'roomName') as patient_room_name " +
                    "FROM t_mission m LEFT JOIN m_waypoint w ON m.waypoint_id = w.id " +
                    "LEFT JOIN t_simrs_active_delivery_cache c ON c.request_code = m.request_code ";

    private static final RowMapper<Map<String, Object>> MISSION_ROW = (rs, rowNum) -> {
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
        map.put("compartmentNo", rs.getObject("compartment_no"));
        map.put("patientName", rs.getString("patient_name"));
        map.put("patientRoomName", rs.getString("patient_room_name"));
        map.put("simulated", rs.getBoolean("simulated"));
        map.put("createdAt", rs.getTimestamp("created_at"));
        map.put("updatedAt", rs.getTimestamp("updated_at"));
        return map;
    };

    @GetMapping("/missions")
    public List<Map<String, Object>> getMissions(@RequestParam(value = "limit", defaultValue = "50") int limit) {
        return db.query(MISSION_SELECT + "ORDER BY m.created_at DESC LIMIT ?", MISSION_ROW, limit);
    }

    @GetMapping("/missions/{id}")
    public Map<String, Object> getMissionDetail(@PathVariable UUID id) {
        var rows = db.query(MISSION_SELECT + "WHERE m.id = ?", MISSION_ROW, id);

        if (rows.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Misi tidak ditemukan");
        }

        Map<String, Object> mission = new LinkedHashMap<>(rows.get(0));

        // Misi yang menunggu slot robot: tampilkan posisinya di antrian.
        if ("QUEUED".equals(mission.get("status"))) {
            mission.put("queuePosition", simulator().queuePosition(id));
        }

        // Get mission events
        var events = db.query(
                "SELECT id, status, source, message, happened_at FROM h_mission_event WHERE mission_id = ? ORDER BY happened_at ASC",
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
            return simulator().cancelMission(id, user.getName());
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

    // ── Admin endpoints (require ADMIN role — gate in SecurityConfiguration) ───

    @GetMapping("/simrs/admin/config")
    public Map<String, Object> getSimrsAdminConfig() {
        return adminService.getConfig();
    }

    @PostMapping("/simrs/admin/config")
    public Map<String, Object> updateSimrsAdminConfig(@RequestBody Map<String, Object> patch, Authentication user) {
        return adminService.updateConfig(patch);
    }

    @PatchMapping("/simrs/admin/config")
    public Map<String, Object> patchSimrsAdminConfig(@RequestBody Map<String, Object> patch, Authentication user) {
        return adminService.patchConfig(patch);
    }

    @PostMapping("/simrs/admin/mission/reassign")
    public Map<String, Object> reassignMission(@RequestBody ReassignReq req, Authentication user) {
        if (req == null || req.missionId() == null || req.robotId() == null || req.robotId().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "missionId dan robotId wajib diisi");
        }
        try {
            return adminService.reassignMission(req.missionId(), req.robotId(), user.getName());
        } catch (NoSuchElementException e) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, e.getMessage());
        } catch (IllegalStateException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, e.getMessage());
        }
    }

    @PostMapping("/simrs/admin/mission/reassign-batch")
    public List<Map<String, Object>> reassignBatch(@RequestBody List<Map<String, Object>> items, Authentication user) {
        return adminService.reassignBatch(items, user.getName());
    }

    private SimulatedRobotService simulator() {
        if (robotService == null) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Legacy mission lifecycle hanya tersedia pada ROBOT_MODE=sim");
        }
        return robotService;
    }

    public record MissionReq(UUID waypointId, String roomCode, String requestCode, Integer compartmentNo) {}
    public record CommandReq(String command, Map<String, Object> params) {}
    public record DeliveryStatusReq(String requestCode, String toStatus, String note, Integer compartmentNo, String idempotencyKey) {}
    public record ReassignReq(UUID missionId, String robotId) {}
}
