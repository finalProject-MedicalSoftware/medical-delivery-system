package id.nevo.monitoring;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.*;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;

@RestController
@RequestMapping("/api/v1")
public class MapApi {
    private final JdbcTemplate db;
    private final ObjectMapper json = new ObjectMapper();
    private final ObjectMapper yaml = new ObjectMapper(new YAMLFactory());
    private final Path storage;
    private final SimrsClientService simrsService;

    public MapApi(JdbcTemplate db, @Value("${nevo.storage-dir}") String path, SimrsClientService simrsService) {
        this.db = db;
        this.storage = Path.of(path).toAbsolutePath().normalize();
        this.simrsService = simrsService;
    }

    private ResponseStatusException bad(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

    private byte[] file(MultipartFile m, Set<String> suffixes) throws IOException {
        if (m == null || m.isEmpty()) throw bad("Missing file");
        String name = Objects.toString(m.getOriginalFilename(), "").toLowerCase(Locale.ROOT);
        if (suffixes.stream().noneMatch(name::endsWith)) throw bad("Unsupported file extension");
        return m.getBytes();
    }

    private JsonNode parseYaml(byte[] b) throws IOException {
        if (b.length > 1024 * 1024) throw bad("YAML exceeds 1MB");
        return yaml.readTree(b);
    }

    private String sha(byte[] b) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(b));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private UUID record(String kind, String filename, byte[] content, Object summary, String who, Map<String, byte[]> files) throws IOException {
        UUID id = UUID.randomUUID();
        Path dir = storage.resolve(id.toString());
        Files.createDirectories(dir);
        for (var entry : files.entrySet()) {
            Files.write(dir.resolve(entry.getKey()), entry.getValue(), StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
        }
        db.update("INSERT INTO m_mapping_import (id,kind,file_name,checksum,storage_path,summary,created_by) VALUES (?,?,?,?,?,CAST(? AS jsonb),?)",
                id, kind, filename, sha(content), dir.toString(), json.writeValueAsString(summary), who);
        db.update("INSERT INTO h_mapping_audit(actor,operation,mapping_id) VALUES (?,?,?)", who, "UPLOAD_" + kind, id);
        return id;
    }

    @PostMapping(value = "/simrs-mappings/import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Map<String, Object> simrs(@RequestPart("file") MultipartFile upload, Authentication user) throws IOException {
        byte[] data = file(upload, Set.of(".yaml", ".yml"));
        JsonNode root = parseYaml(data);
        if (root.path("version").asInt() != 1 || !root.path("wards").isArray() || !root.path("source").asText().equals("simrs-dummy")) {
            throw bad("Invalid SIMRS mapping schema");
        }
        Set<String> rooms = new HashSet<>();
        int total = 0;
        for (JsonNode ward : root.path("wards")) {
            if (ward.path("code").asText().isBlank() || !ward.path("rooms").isArray() || !ward.path("floor").canConvertToInt()) {
                throw bad("Invalid ward");
            }
            for (JsonNode room : ward.path("rooms")) {
                String code = room.path("roomCode").asText();
                if (code.isBlank() || room.path("name").asText().isBlank() || !room.path("beds").isArray() || !rooms.add(code)) {
                    throw bad("Missing/duplicate room or beds");
                }
                total++;
            }
        }
        Map<String, Object> summary = Map.of(
                "wards", root.path("wards").size(),
                "rooms", total,
                "source", "manual-upload",
                "note", "Preview only; does not replace live SIMRS mapping"
        );
        UUID id = record("SIMRS", "simrs-mapping.yaml", data, summary, user.getName(), Map.of("simrs-mapping.yaml", data));
        return Map.of("id", id, "summary", summary, "active", false);
    }

    @PostMapping(value = "/maps/import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Map<String, Object> ros(@RequestPart("yaml") MultipartFile config, @RequestPart("image") MultipartFile image, Authentication user) throws IOException {
        byte[] y = file(config, Set.of(".yaml", ".yml"));
        byte[] img = file(image, Set.of(".pgm", ".png"));
        JsonNode root = parseYaml(y);

        String expected = Path.of(root.path("image").asText("")).getFileName().toString();
        if (expected.isBlank() || !expected.equalsIgnoreCase(image.getOriginalFilename())) {
            throw bad("YAML image filename does not match upload");
        }

        double res = root.path("resolution").asDouble(Double.NaN);
        JsonNode origin = root.path("origin");
        if (!Double.isFinite(res) || res <= 0 || !origin.isArray() || origin.size() != 3) {
            throw bad("Missing/invalid resolution or origin");
        }
        for (JsonNode c : origin) {
            if (!c.isNumber() || !Double.isFinite(c.asDouble())) throw bad("Non-finite origin");
        }
        if (img.length > 12 * 1024 * 1024) throw bad("Image exceeds 12MB");

        String name = expected.toLowerCase(Locale.ROOT);
        int width = 0;
        int height = 0;
        byte[] previewPngBytes;

        if (name.endsWith(".png")) {
            if (!(img.length >= 8 && img[0] == (byte) 137 && img[1] == 80 && img[2] == 78 && img[3] == 71)) {
                throw bad("Invalid PNG header");
            }
            BufferedImage bImg = ImageIO.read(new ByteArrayInputStream(img));
            if (bImg == null) throw bad("Corrupted PNG image");
            width = bImg.getWidth();
            height = bImg.getHeight();
            previewPngBytes = img;
        } else if (name.endsWith(".pgm")) {
            if (!(img.length >= 3 && img[0] == 'P' && (img[1] == '2' || img[1] == '5') && Character.isWhitespace((char) img[2]))) {
                throw bad("Invalid PGM header");
            }
            try {
                var pgmData = PgmImageConverter.parse(img);
                width = pgmData.width();
                height = pgmData.height();
                previewPngBytes = PgmImageConverter.convertToPng(img);
            } catch (Exception ex) {
                throw bad("Failed to parse PGM: " + ex.getMessage());
            }
        } else {
            throw bad("Unsupported image format: " + name);
        }

        String frameId = root.path("frame_id").asText("map");
        int negate = root.path("negate").asInt(0);
        double occupiedThresh = root.path("occupied_thresh").asDouble(0.65);
        double freeThresh = root.path("free_thresh").asDouble(0.25);

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("resolution", res);
        summary.put("origin", json.convertValue(origin, List.class));
        summary.put("image", expected);
        summary.put("previewImage", "preview.png");
        summary.put("width", width);
        summary.put("height", height);
        summary.put("frameId", frameId);
        summary.put("negate", negate);
        summary.put("occupiedThresh", occupiedThresh);
        summary.put("freeThresh", freeThresh);
        summary.put("note", "Web visualization only; no ROS map deployment");

        Map<String, byte[]> filesToStore = new LinkedHashMap<>();
        filesToStore.put("map.yaml", y);
        filesToStore.put(expected, img);
        filesToStore.put("preview.png", previewPngBytes);

        UUID id = record("ROS", "map.yaml", y, summary, user.getName(), filesToStore);
        return Map.of("id", id, "summary", summary, "active", false);
    }

    @GetMapping("/mappings")
    public List<Map<String, Object>> all() {
        return db.query("SELECT id,kind,file_name,summary::text as summary_text,created_by,created_at,active FROM m_mapping_import ORDER BY created_at DESC", (rs, rowNum) -> {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("id", rs.getObject("id"));
            map.put("kind", rs.getString("kind"));
            map.put("file_name", rs.getString("file_name"));
            try {
                map.put("summary", json.readTree(rs.getString("summary_text")));
            } catch (Exception e) {
                map.put("summary", rs.getString("summary_text"));
            }
            map.put("created_by", rs.getString("created_by"));
            map.put("created_at", rs.getTimestamp("created_at"));
            map.put("active", rs.getBoolean("active"));
            return map;
        });
    }

    @GetMapping("/maps/{id}/metadata")
    public Map<String, Object> metadata(@PathVariable UUID id) throws IOException {
        var rows = db.queryForList("SELECT id, file_name, summary::text as summary_text, created_by, created_at, active FROM m_mapping_import WHERE id=? AND kind='ROS'", id);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Map not found");
        var row = rows.get(0);
        JsonNode summary = json.readTree(row.get("summary_text").toString());
        Map<String, Object> res = new LinkedHashMap<>();
        res.put("id", row.get("id"));
        res.put("fileName", row.get("file_name"));
        res.put("resolution", summary.path("resolution").asDouble(0.05));
        res.put("origin", summary.path("origin"));
        res.put("width", summary.path("width").asInt(0));
        res.put("height", summary.path("height").asInt(0));
        res.put("frameId", summary.path("frameId").asText("map"));
        res.put("active", row.get("active"));
        res.put("previewUrl", "/api/v1/maps/" + id + "/preview");
        res.put("createdAt", row.get("created_at"));
        res.put("createdBy", row.get("created_by"));
        return res;
    }

    @GetMapping({"/maps/{id}/image", "/maps/{id}/preview"})
    public ResponseEntity<byte[]> previewImage(@PathVariable UUID id) throws IOException {
        var rows = db.queryForList("SELECT storage_path, summary::text as summary_text FROM m_mapping_import WHERE id=? AND kind='ROS'", id);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Map not found");

        String stored = Objects.toString(rows.get(0).get("storage_path"), "").trim();
        if (stored.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Map has no stored files");

        Path dir = Path.of(stored);
        Path previewFile = dir.resolve("preview.png");

        if (Files.isRegularFile(previewFile)) {
            return ResponseEntity.ok().contentType(MediaType.IMAGE_PNG).body(Files.readAllBytes(previewFile));
        }

        JsonNode summary = json.readTree(rows.get(0).get("summary_text").toString());
        String imageName = summary.path("image").asText("").trim();
        if (imageName.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Map has no original image");
        Path originalImage = dir.resolve(imageName);

        if (!Files.isRegularFile(originalImage)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Original image file missing");
        }

        byte[] originalBytes = Files.readAllBytes(originalImage);
        byte[] pngBytes;

        if (imageName.toLowerCase(Locale.ROOT).endsWith(".png")) {
            pngBytes = originalBytes;
        } else if (imageName.toLowerCase(Locale.ROOT).endsWith(".pgm")) {
            try {
                pngBytes = PgmImageConverter.convertToPng(originalBytes);
                Files.write(previewFile, pngBytes, StandardOpenOption.CREATE);
            } catch (Exception ex) {
                throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to convert PGM to PNG: " + ex.getMessage());
            }
        } else {
            throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Unsupported image type");
        }

        return ResponseEntity.ok().contentType(MediaType.IMAGE_PNG).body(pngBytes);
    }

    @PostMapping("/maps/{id}/activate")
    @Transactional
    public Map<String, Object> activate(@PathVariable UUID id, Authentication user) {
        Integer count = db.queryForObject("SELECT count(*) FROM m_mapping_import WHERE id=? AND kind='ROS'", Integer.class, id);
        if (count == null || count == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Map not found");
        db.update("UPDATE m_mapping_import SET active=false WHERE kind='ROS'");
        db.update("UPDATE m_mapping_import SET active=true WHERE id=?", id);
        db.update("INSERT INTO h_mapping_audit(actor,operation,mapping_id) VALUES (?,?,?)", user.getName(), "ACTIVATE_ROS_WEB_ONLY", id);
        return Map.of("id", id, "active", true, "robotMapChanged", false);
    }

    @GetMapping("/maps/{mapId}/waypoints")
    public List<Map<String, Object>> waypoints(@PathVariable UUID mapId) {
        return db.queryForList("SELECT id,map_id,room_code,name,x,y,yaw,enabled,created_by,updated_at FROM m_waypoint WHERE map_id=? ORDER BY name", mapId);
    }

    @PostMapping("/maps/{mapId}/waypoints")
    public Map<String, Object> addWaypoint(@PathVariable UUID mapId, @RequestBody WaypointReq w, Authentication user) throws IOException {
        validateWaypoint(mapId, null, w);
        UUID id = UUID.randomUUID();
        db.update("INSERT INTO m_waypoint(id,map_id,room_code,name,x,y,yaw,enabled,created_by,updated_at) VALUES (?,?,?,?,?,?,?,true,?,now())",
                id, mapId, (w.roomCode() == null || w.roomCode().isBlank()) ? null : w.roomCode(), w.name(), w.x(), w.y(), w.yaw(), user.getName());
        db.update("INSERT INTO h_mapping_audit(actor,operation,mapping_id) VALUES (?,?,?)", user.getName(), "WAYPOINT_CREATE", mapId);
        return Map.of("id", id, "mapId", mapId);
    }

    @PutMapping("/maps/{mapId}/waypoints/{waypointId}")
    public Map<String, Object> updateWaypoint(@PathVariable UUID mapId, @PathVariable UUID waypointId, @RequestBody WaypointReq w, Authentication user) throws IOException {
        Integer count = db.queryForObject("SELECT count(*) FROM m_waypoint WHERE id=? AND map_id=?", Integer.class, waypointId, mapId);
        if (count == null || count == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Waypoint not found");
        validateWaypoint(mapId, waypointId, w);

        db.update("UPDATE m_waypoint SET room_code=?, name=?, x=?, y=?, yaw=?, updated_at=now() WHERE id=? AND map_id=?",
                (w.roomCode() == null || w.roomCode().isBlank()) ? null : w.roomCode(), w.name(), w.x(), w.y(), w.yaw(), waypointId, mapId);
        db.update("INSERT INTO h_mapping_audit(actor,operation,mapping_id) VALUES (?,?,?)", user.getName(), "WAYPOINT_UPDATE", mapId);
        return Map.of("id", waypointId, "mapId", mapId, "updated", true);
    }

    @DeleteMapping("/maps/{mapId}/waypoints/{waypointId}")
    public Map<String, Object> deleteWaypoint(@PathVariable UUID mapId, @PathVariable UUID waypointId, Authentication user) {
        int updated = db.update("DELETE FROM m_waypoint WHERE id=? AND map_id=?", waypointId, mapId);
        if (updated == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Waypoint not found");
        db.update("INSERT INTO h_mapping_audit(actor,operation,mapping_id) VALUES (?,?,?)", user.getName(), "WAYPOINT_DELETE", mapId);
        return Map.of("id", waypointId, "mapId", mapId, "deleted", true);
    }

    @PatchMapping("/maps/{mapId}/waypoints/{waypointId}/toggle")
    public Map<String, Object> toggleWaypoint(@PathVariable UUID mapId, @PathVariable UUID waypointId, Authentication user) {
        int updated = db.update("UPDATE m_waypoint SET enabled = NOT enabled, updated_at=now() WHERE id=? AND map_id=?", waypointId, mapId);
        if (updated == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Waypoint not found");
        db.update("INSERT INTO h_mapping_audit(actor,operation,mapping_id) VALUES (?,?,?)", user.getName(), "WAYPOINT_TOGGLE", mapId);
        Boolean enabled = db.queryForObject("SELECT enabled FROM m_waypoint WHERE id=?", Boolean.class, waypointId);
        return Map.of("id", waypointId, "mapId", mapId, "enabled", Boolean.TRUE.equals(enabled));
    }

    private void validateWaypoint(UUID mapId, UUID currentWaypointId, WaypointReq w) throws IOException {
        if (w.name() == null || w.name().isBlank() || !Double.isFinite(w.x()) || !Double.isFinite(w.y()) || !Double.isFinite(w.yaw())) {
            throw bad("Invalid waypoint parameters: name required, x/y/yaw must be finite numbers");
        }

        var mapRows = db.queryForList("SELECT summary::text as summary_text FROM m_mapping_import WHERE id=? AND kind='ROS'", mapId);
        if (mapRows.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Referenced map does not exist");
        }

        JsonNode summary = json.readTree(mapRows.get(0).get("summary_text").toString());
        double resolution = summary.path("resolution").asDouble(0.05);
        int width = summary.path("width").asInt(0);
        int height = summary.path("height").asInt(0);
        JsonNode originNode = summary.path("origin");
        double originX = originNode.path(0).asDouble(0);
        double originY = originNode.path(1).asDouble(0);
        double originYaw = originNode.path(2).asDouble(0);

        if (width > 0 && height > 0) {
            boolean inBounds = RosCoordinateTransform.isWithinBounds(w.x(), w.y(), resolution, originX, originY, originYaw, width, height);
            if (!inBounds) {
                throw bad(String.format("Waypoint (%.2f, %.2f) is out of map bounds [%dx%d, res=%.3f, origin=(%.2f, %.2f)]",
                        w.x(), w.y(), width, height, resolution, originX, originY));
            }
        }

        if (w.roomCode() != null && !w.roomCode().isBlank()) {
            String sql = currentWaypointId == null
                    ? "SELECT count(*) FROM m_waypoint WHERE map_id=? AND room_code=?"
                    : "SELECT count(*) FROM m_waypoint WHERE map_id=? AND room_code=? AND id!=?";
            Integer count = currentWaypointId == null
                    ? db.queryForObject(sql, Integer.class, mapId, w.roomCode())
                    : db.queryForObject(sql, Integer.class, mapId, w.roomCode(), currentWaypointId);
            if (count != null && count > 0) {
                throw bad("Room code '" + w.roomCode() + "' is already assigned to another waypoint on this map");
            }
        }
    }

    @GetMapping("/rooms")
    public List<Map<String, Object>> getRooms() {
        return simrsService.getLiveRooms();
    }

    public record WaypointReq(String roomCode, String name, double x, double y, double yaw) {}
}
