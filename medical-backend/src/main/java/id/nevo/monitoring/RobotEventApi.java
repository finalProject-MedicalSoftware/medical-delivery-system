package id.nevo.monitoring;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Map;

/** Uplink status robot dari gateway medical-ws (rahasia internal, bukan sesi pengguna). */
@RestController
@RequestMapping("/internal/robot-events")
public class RobotEventApi {
    private final String secret;
    private final RealMissionService missions;

    public RobotEventApi(@Value("${nevo.internal-publish.secret:}") String secret, ObjectProvider<RealMissionService> missions) {
        this.secret = secret;
        this.missions = missions.getIfAvailable();
    }

    @PostMapping
    @SuppressWarnings("unchecked")
    public Map<String, Object> receive(@RequestHeader(value = "X-Internal-Secret", required = false) String supplied,
                                       @RequestBody Map<String, Object> frame) {
        if (secret == null || secret.isBlank() || supplied == null ||
                !MessageDigest.isEqual(secret.getBytes(StandardCharsets.UTF_8), supplied.getBytes(StandardCharsets.UTF_8))) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }
        if (missions == null) return Map.of("handled", false, "reason", "ROBOT_MODE bukan real");
        Object data = frame.get("data");
        missions.onRobotEvent(String.valueOf(frame.get("code")), data instanceof Map<?, ?> m ? (Map<String, Object>) m : null);
        return Map.of("handled", true);
    }
}
