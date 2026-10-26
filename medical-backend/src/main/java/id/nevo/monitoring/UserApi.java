package id.nevo.monitoring;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.*;

// Manajemen user (m_user) — ADMIN only (lihat SecurityConfiguration).
// Audit operasi user ditulis ke h_mapping_audit dengan mapping_id=NULL
// (tabel audit bersama, mapping_id nullable — lihat V1__mapping.sql).
@RestController
@RequestMapping("/api/v1/users")
public class UserApi {
    private static final Set<String> ROLES = Set.of("ADMIN", "FARMASI", "OPERATOR");

    private final JdbcTemplate jdbc;
    private final PasswordEncoder encoder;

    public UserApi(JdbcTemplate jdbc, PasswordEncoder encoder) {
        this.jdbc = jdbc;
        this.encoder = encoder;
    }

    @GetMapping
    public List<Map<String, Object>> list() {
        return jdbc.queryForList(
                "SELECT id, username, full_name, role, active, created_at, updated_at FROM m_user ORDER BY created_at");
    }

    @PostMapping
    public Map<String, Object> create(@RequestBody UserReq req, Authentication auth) {
        if (req == null) throw bad("Body tidak boleh kosong");
        String role = normalize(req.role());
        validate(req.username(), req.fullName(), role);
        if (req.password() == null || req.password().length() < 8) throw bad("Password minimal 8 karakter");
        Boolean used = jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM m_user WHERE username=?)", Boolean.class, req.username().trim());
        if (Boolean.TRUE.equals(used)) throw bad("Username sudah dipakai");
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO m_user(id,username,full_name,password_hash,role) VALUES (?,?,?,?,?::user_role)",
                id, req.username().trim(), req.fullName().trim(), encoder.encode(req.password()), role);
        audit(auth, "USER_CREATE");
        return Map.of("id", id, "username", req.username().trim(), "role", role);
    }

    @PutMapping("/{id}")
    public Map<String, Object> update(@PathVariable UUID id, @RequestBody UserUpdateReq req, Authentication auth) {
        if (req == null) throw bad("Body tidak boleh kosong");
        String role = normalize(req.role());
        validateProfile(req.fullName(), role);
        exists(id);
        if (Boolean.FALSE.equals(req.active()) && isSelf(id, auth)) throw bad("Tidak bisa menonaktifkan akun sendiri");
        jdbc.update("UPDATE m_user SET full_name=?, role=?::user_role, active=?, updated_at=now() WHERE id=?",
                req.fullName().trim(), role, Boolean.TRUE.equals(req.active()), id);
        audit(auth, "USER_UPDATE");
        return Map.of("id", id, "role", role, "active", Boolean.TRUE.equals(req.active()));
    }

    @PatchMapping("/{id}/toggle")
    public Map<String, Object> toggle(@PathVariable UUID id, Authentication auth) {
        exists(id);
        Boolean active = jdbc.queryForObject("SELECT active FROM m_user WHERE id=?", Boolean.class, id);
        if (Boolean.TRUE.equals(active) && isSelf(id, auth)) throw bad("Tidak bisa menonaktifkan akun sendiri");
        jdbc.update("UPDATE m_user SET active=NOT active, updated_at=now() WHERE id=?", id);
        audit(auth, "USER_TOGGLE");
        return Map.of("id", id, "active", !Boolean.TRUE.equals(active));
    }

    @DeleteMapping("/{id}")
    public Map<String, Boolean> delete(@PathVariable UUID id, Authentication auth) {
        exists(id);
        if (isSelf(id, auth)) throw bad("Tidak bisa menghapus akun sendiri");
        jdbc.update("DELETE FROM m_user WHERE id=?", id);
        audit(auth, "USER_DELETE");
        return Map.of("success", true);
    }

    private ResponseStatusException bad(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

    private String normalize(String role) {
        return role == null ? "" : role.trim().toUpperCase(Locale.ROOT);
    }

    private void validate(String username, String fullName, String role) {
        if (username == null || !username.trim().matches("[A-Za-z0-9_.-]{3,64}"))
            throw bad("Username 3-64 karakter alfanumerik (boleh _ . -)");
        validateProfile(fullName, role);
    }

    private void validateProfile(String fullName, String role) {
        if (fullName == null || fullName.trim().isEmpty() || fullName.trim().length() > 150)
            throw bad("Nama lengkap 1-150 karakter");
        if (!ROLES.contains(role)) throw bad("Role harus ADMIN, FARMASI, atau OPERATOR");
    }

    private void exists(UUID id) {
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM m_user WHERE id=?", Integer.class, id);
        if (n == null || n == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "User tidak ditemukan");
    }

    private boolean isSelf(UUID id, Authentication auth) {
        String username = jdbc.queryForObject("SELECT username FROM m_user WHERE id=?", String.class, id);
        return username != null && username.equals(auth.getName());
    }

    private void audit(Authentication auth, String operation) {
        jdbc.update("INSERT INTO h_mapping_audit(actor,operation,mapping_id) VALUES (?,?,?)", auth.getName(), operation, null);
    }

    public record UserReq(String username, String fullName, String password, String role) {}

    public record UserUpdateReq(String fullName, String role, Boolean active) {}
}
