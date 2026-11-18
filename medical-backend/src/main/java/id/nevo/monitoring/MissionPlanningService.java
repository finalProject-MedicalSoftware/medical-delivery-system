package id.nevo.monitoring;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.*;

/** Validates a patient manifest against live SIMRS placement and the active ROS map. */
@Service
public class MissionPlanningService {
    private final JdbcTemplate db;
    private final SimrsClientService simrs;
    private final SimulatedRobotService simulator;
    private final RealMissionService real;

    public MissionPlanningService(JdbcTemplate db, SimrsClientService simrs,
                                  ObjectProvider<SimulatedRobotService> simulator) {
        this(db, simrs, simulator, null);
    }

    @org.springframework.beans.factory.annotation.Autowired
    public MissionPlanningService(JdbcTemplate db, SimrsClientService simrs,
                                  ObjectProvider<SimulatedRobotService> simulator,
                                  ObjectProvider<RealMissionService> real) {
        this.db = db;
        this.simrs = simrs;
        this.simulator = simulator.getIfAvailable();
        this.real = real == null ? null : real.getIfAvailable();
    }

    public Map<String, Object> dispatch(ManifestRequest request, String userName) {
        if (simulator == null && real == null) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Dispatch manifest hanya tersedia ketika adapter navigasi mendukung lifecycle misi");
        if (request == null || request.items() == null || request.items().isEmpty()) throw bad("Manifest tidak boleh kosong");
        if (simulator != null) {
            if (!Objects.equals(request.robotId(), simulator.getRobotState().get("robotId"))) throw bad("Robot target tidak valid");
            if (!"IDLE".equals(simulator.getRobotState().get("status"))) throw conflict("Robot belum siap menerima manifest baru");
        } else {
            if (blank(request.robotId())) throw bad("Robot target wajib diisi");
            real.requireDispatchable(request.robotId());
        }

        int compartmentCount = simulator != null ? simulator.getCompartmentCount() : real.getCompartmentCount();
        validateShape(request.items(), compartmentCount);
        List<PreparedItem> prepared = new ArrayList<>();
        for (ManifestItem item : request.items()) prepared.add(validateLive(item));

        UUID manifestId = UUID.randomUUID();
        if (simulator == null) {
            List<RealMissionService.Stop> stops = new ArrayList<>();
            for (PreparedItem p : prepared) stops.add(new RealMissionService.Stop(p.waypointId(), p.roomCode(), p.bedId(),
                    p.patientMrn(), p.requestCode(), p.compartmentNo(), p.placementUpdatedAt(), p.source()));
            return real.dispatchManifest(request.robotId(), stops, userName, manifestId);
        }
        List<Map<String, Object>> missions = new ArrayList<>();
        for (int i = 0; i < prepared.size(); i++) {
            PreparedItem item = prepared.get(i);
            missions.add(simulator.dispatchMission(
                    item.waypointId(), item.roomCode(), userName, item.requestCode(), item.compartmentNo(),
                    item.patientMrn(), item.bedId(), item.placementUpdatedAt(), item.source(), manifestId, i + 1));
        }
        return Map.of("manifestId", manifestId, "status", "ACCEPTED", "missions", missions);
    }

    static void validateShape(List<ManifestItem> items, int compartmentCount) {
        Set<String> patients = new HashSet<>();
        Set<Integer> compartments = new HashSet<>();
        for (ManifestItem item : items) {
            if (item == null || blank(item.patientMrn())) throw bad("Setiap item wajib memiliki MRN pasien");
            if (!patients.add(item.patientMrn().trim().toUpperCase(Locale.ROOT))) throw bad("Pasien yang sama tidak boleh ditambahkan dua kali");
            if (item.compartmentNo() == null || item.compartmentNo() < 0 || item.compartmentNo() >= compartmentCount) throw bad("Kompartemen tidak sesuai konfigurasi robot");
            if (!compartments.add(item.compartmentNo())) throw bad("Kompartemen tidak boleh digunakan lebih dari satu pasien");
            if (item.waypointId() == null || blank(item.roomCode()) || blank(item.bedId()) || blank(item.placementUpdatedAt())) throw bad("Placement dan waypoint setiap pasien wajib lengkap");
        }
    }

    private PreparedItem validateLive(ManifestItem item) {
        final JsonNode root;
        try { root = simrs.getPatient(item.patientMrn().trim()); }
        catch (Exception ex) { throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Data pasien SIMRS tidak dapat diverifikasi"); }
        JsonNode patient = root.path("patient");
        // robotEligible dari SIMRS: ada pengantaran yang sudah dikirim ke robot DAN
        // (pasien menular ATAU petugas menulis alasan untuk pasien tidak menular).
        JsonNode eligibleFlag = patient.get("robotEligible");
        if (eligibleFlag == null || !eligibleFlag.isBoolean() || !eligibleFlag.asBoolean()) {
            throw conflict("Pasien tidak memiliki pengantaran yang dikirim ke robot, atau alasan/status menularnya tidak dapat diverifikasi. Muat ulang pasien dan tinjau manifest.");
        }
        if (!patient.path("active").asBoolean(false)) throw conflict("Pasien tidak memiliki placement rawat inap aktif");
        String roomCode = patient.path("roomCode").asText("");
        String bedId = patient.path("bedId").asText("");
        String currentUpdatedAt = patient.path("placementUpdatedAt").asText("");
        if (!roomCode.equals(item.roomCode()) || !bedId.equals(item.bedId()) || !currentUpdatedAt.equals(item.placementUpdatedAt())) {
            throw conflict("Penempatan pasien berubah. Muat ulang pasien dan tinjau manifest.");
        }

        String requestCode = blank(item.requestCode()) ? null : item.requestCode().trim();
        if (requestCode != null) {
            boolean found = false;
            for (JsonNode delivery : root.path("activeDeliveries")) {
                if (requestCode.equals(delivery.path("requestCode").asText())) { found = true; break; }
            }
            if (!found) throw conflict("Request pengiriman SIMRS tidak lagi aktif untuk pasien");
        }

        Integer waypointCount = db.queryForObject(
                "SELECT count(*) FROM m_waypoint w JOIN m_mapping_import m ON m.id=w.map_id AND m.kind='ROS' AND m.active=true " +
                        "WHERE w.id=? AND w.enabled=true AND w.room_code=? AND w.bed_id=?",
                Integer.class, item.waypointId(), roomCode, bedId);
        if (waypointCount == null || waypointCount != 1) throw conflict("Waypoint kasur pasien belum dikonfigurasi pada peta ROS aktif");

        Instant placement;
        try { placement = Instant.parse(currentUpdatedAt); }
        catch (Exception ex) { throw conflict("Timestamp placement pasien tidak valid"); }
        return new PreparedItem(item.waypointId(), roomCode, bedId, item.patientMrn().trim(), requestCode,
                item.compartmentNo(), placement, requestCode == null ? "MANUAL_SIMRS" : "SIMRS_REQUEST");
    }

    private static boolean blank(String value) { return value == null || value.isBlank(); }
    private static ResponseStatusException bad(String message) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, message); }
    private static ResponseStatusException conflict(String message) { return new ResponseStatusException(HttpStatus.CONFLICT, message); }

    public record ManifestRequest(String robotId, List<ManifestItem> items) { }
    public record ManifestItem(String patientMrn, String roomCode, String bedId, String placementUpdatedAt,
                               UUID waypointId, Integer compartmentNo, String requestCode) { }
    private record PreparedItem(UUID waypointId, String roomCode, String bedId, String patientMrn,
                                String requestCode, Integer compartmentNo, Instant placementUpdatedAt, String source) { }
}
