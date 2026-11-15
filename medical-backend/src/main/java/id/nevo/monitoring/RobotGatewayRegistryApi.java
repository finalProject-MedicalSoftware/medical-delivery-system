package id.nevo.monitoring;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;
import java.util.Map;

/** Administrative registry lookup only. It does not authenticate a physical device. */
@RestController
@RequestMapping("/internal/robots")
public class RobotGatewayRegistryApi {
    private final JdbcTemplate jdbc;
    private final String secret;
    public RobotGatewayRegistryApi(JdbcTemplate jdbc,
            @Value("${nevo.internal-publish.secret:}") String secret) {
        this.jdbc = jdbc;
        this.secret = secret;
    }
    @GetMapping("/{robotId}/eligibility")
    public Map<String,Object> eligibility(@PathVariable String robotId,
            @RequestHeader(value="X-Internal-Secret", required=false) String supplied) {
        if (secret == null || secret.isBlank() || supplied == null ||
                !MessageDigest.isEqual(secret.getBytes(StandardCharsets.UTF_8),
                    supplied.getBytes(StandardCharsets.UTF_8))) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }
        List<Map<String,Object>> rows = jdbc.queryForList(
            "SELECT registration_status FROM m_robot WHERE robot_id=?",robotId);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        String status = (String)rows.get(0).get("registration_status");
        return Map.of("robotId",robotId,"registrationStatus",status,
            "eligible", "VERIFIED".equals(status));
    }
}
