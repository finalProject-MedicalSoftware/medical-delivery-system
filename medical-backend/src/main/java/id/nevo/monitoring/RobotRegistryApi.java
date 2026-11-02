package id.nevo.monitoring;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.*;

// Registrasi robot node (m_robot) — POST = ADMIN only via SecurityConfiguration
// (matcher HttpMethod.POST "/api/v1/robots"; GET /robots komposit MissionApi tidak berubah).
// Audit operasi robot ditulis ke h_mapping_audit dengan mapping_id=NULL
// (konvensi tabel audit bersama — lihat UserApi/AuthApi/MapApi).
@RestController
@RequestMapping("/api/v1/robots")
public class RobotRegistryApi {

    private final JdbcTemplate jdbc;

    public RobotRegistryApi(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Daftar robot terdaftar (m_robot) — kontrak robot-command.md §7. */
    @GetMapping("/registry")
    public List<Map<String, Object>> registry() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> row : jdbc.queryForList(
                "SELECT robot_id, name, model, registered_at FROM m_robot ORDER BY robot_id")) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("robotId", row.get("robot_id"));
            item.put("name", row.get("name"));
            item.put("model", row.get("model"));
            Object registeredAt = row.get("registered_at");
            item.put("registeredAt", registeredAt == null ? null : registeredAt.toString());
            out.add(item);
        }
        return out;
    }

    /** Registrasi robot node baru (kontrak robot-command.md §7): validasi → duplikat 409 → insert + audit. */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> register(@RequestBody RobotReq req, Authentication auth) {
        if (req == null) throw bad("Body tidak boleh kosong");
        String robotId = req.robotId() == null ? "" : req.robotId().trim();
        String name = req.name() == null ? "" : req.name().trim();
        if (!robotId.matches("[A-Za-z0-9_.-]{3,64}"))
            throw bad("robotId 3-64 karakter alfanumerik (boleh _ . -)");
        if (name.isEmpty() || name.length() > 150)
            throw bad("Nama robot 1-150 karakter");
        String model = req.model() == null ? "" : req.model().trim();
        if (model.length() > 100)
            throw bad("Model maksimal 100 karakter");

        Boolean used = jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM m_robot WHERE robot_id=?)",
                Boolean.class, robotId);
        if (Boolean.TRUE.equals(used))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "robotId sudah terdaftar");

        if (model.isEmpty()) {
            // Tanpa kolom model → default DB 'NEVO-A1' yang berlaku; baca balik agar jawaban sesuai DB.
            jdbc.update("INSERT INTO m_robot(robot_id,name) VALUES (?,?)", robotId, name);
            model = jdbc.queryForObject("SELECT model FROM m_robot WHERE robot_id=?", String.class, robotId);
        } else {
            jdbc.update("INSERT INTO m_robot(robot_id,name,model) VALUES (?,?,?)", robotId, name, model);
        }
        audit(auth, "ROBOT_REGISTER");
        return Map.of("robotId", robotId, "name", name, "model", model == null ? "" : model);
    }

    private ResponseStatusException bad(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

    private void audit(Authentication auth, String operation) {
        jdbc.update("INSERT INTO h_mapping_audit(actor,operation,mapping_id) VALUES (?,?,?)",
                auth.getName(), operation, null);
    }

    public record RobotReq(String robotId, String name, String model) {}
}
