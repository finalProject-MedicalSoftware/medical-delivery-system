package id.nevo.monitoring;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** Lapisan REST RobotRegistryApi.register + registry listing (400/409/201); tanpa DB nyata. */
class RobotRegistryRestP4Test {

    private static final String EXISTS_SQL = "SELECT EXISTS(SELECT 1 FROM m_robot WHERE robot_id=?)";
    private static final String INSERT_MODEL_SQL = "INSERT INTO m_robot(robot_id,name,model) VALUES (?,?,?)";
    private static final String AUDIT_SQL = "INSERT INTO h_mapping_audit(actor,operation,mapping_id) VALUES (?,?,?)";

    private final JdbcTemplate db = mock(JdbcTemplate.class);
    private final Authentication admin = mock(Authentication.class);
    private final RobotRegistryApi api = new RobotRegistryApi(db);

    RobotRegistryRestP4Test() {
        when(admin.getName()).thenReturn("admin");
    }

    private HttpStatus post(RobotRegistryApi.RobotReq req) {
        var ex = assertThrows(ResponseStatusException.class, () -> api.register(req, admin));
        return HttpStatus.valueOf(ex.getStatusCode().value());
    }

    @Test
    void nullOrInvalidBodyIs400AndNeverWrites() {
        assertEquals(HttpStatus.BAD_REQUEST, post(null));
        // robotId terlalu pendek, berisi spasi, atau kosong
        assertEquals(HttpStatus.BAD_REQUEST, post(new RobotRegistryApi.RobotReq("AB", "Robot A", null)));
        assertEquals(HttpStatus.BAD_REQUEST, post(new RobotRegistryApi.RobotReq("NEVO 02", "Robot 2", null)));
        assertEquals(HttpStatus.BAD_REQUEST, post(new RobotRegistryApi.RobotReq(null, "Robot 2", null)));
        // nama kosong / melebihi 150
        assertEquals(HttpStatus.BAD_REQUEST, post(new RobotRegistryApi.RobotReq("NEVO-02", "", null)));
        assertEquals(HttpStatus.BAD_REQUEST, post(new RobotRegistryApi.RobotReq("NEVO-02", "X".repeat(151), null)));
        // model melebihi 100
        assertEquals(HttpStatus.BAD_REQUEST, post(new RobotRegistryApi.RobotReq("NEVO-02", "Robot 2", "M".repeat(101))));
        verify(db, never()).update(anyString(), any(Object[].class));
    }

    @Test
    void duplicateRobotIdIs409AndNoInsert() {
        when(db.queryForObject(EXISTS_SQL, Boolean.class, "NEVO-01")).thenReturn(true);

        assertEquals(HttpStatus.CONFLICT, post(new RobotRegistryApi.RobotReq("NEVO-01", "Robot 1", "NEVO-A1")));

        verify(db, never()).update(anyString(), any(Object[].class));
    }

    @Test
    void validRegistrationInsertsNameAndModelAndAudits() {
        when(db.queryForObject(EXISTS_SQL, Boolean.class, "NEVO-02")).thenReturn(false);

        Map<String, Object> res = api.register(new RobotRegistryApi.RobotReq("NEVO-02", "Robot Pengantar Obat NEVO #2", "NEVO-B2"), admin);

        assertEquals("NEVO-02", res.get("robotId"));
        assertEquals("NEVO-B2", res.get("model"));
        verify(db).update(INSERT_MODEL_SQL, "NEVO-02", "Robot Pengantar Obat NEVO #2", "NEVO-B2");
        verify(db).update(eq(AUDIT_SQL), eq("admin"), eq("ROBOT_REGISTER"), isNull());
    }

    @Test
    void blankModelFallsBackToDatabaseDefault() {
        when(db.queryForObject(EXISTS_SQL, Boolean.class, "NEVO-03")).thenReturn(false);
        when(db.queryForObject("SELECT model FROM m_robot WHERE robot_id=?", String.class, "NEVO-03"))
                .thenReturn("NEVO-A1");

        Map<String, Object> res = api.register(new RobotRegistryApi.RobotReq("NEVO-03", "Robot #3", ""), admin);

        assertEquals("NEVO-A1", res.get("model"));
        // model kosong → insert tanpa kolom model, default DB yang berlaku
        verify(db).update("INSERT INTO m_robot(robot_id,name) VALUES (?,?)", "NEVO-03", "Robot #3");
        verify(db, never()).update(eq(INSERT_MODEL_SQL), any(Object[].class));
        verify(db).update(eq(AUDIT_SQL), eq("admin"), eq("ROBOT_REGISTER"), isNull());
    }

    @Test
    void registryListingIsMappedToCamelCase() {
        when(db.queryForList("SELECT robot_id, name, model, registered_at FROM m_robot ORDER BY robot_id"))
                .thenReturn(List.of(
                        Map.of("robot_id", "NEVO-01", "name", "Robot 1", "model", "NEVO-A1", "registered_at", "2026-10-29T17:03:32Z"),
                        // baris NEVO-02 tanpa model/registered_at (Map.of tidak menerima null)
                        Map.of("robot_id", "NEVO-02", "name", "Robot 2")));

        List<Map<String, Object>> list = api.registry();

        assertEquals(2, list.size());
        assertEquals("NEVO-01", list.get(0).get("robotId"));
        assertEquals("2026-10-29T17:03:32Z", list.get(0).get("registeredAt"));
        assertNull(list.get(1).get("registeredAt")); // registered_at null → null tanpa exception
        assertEquals("NEVO-02", list.get(1).get("robotId"));
    }
}
