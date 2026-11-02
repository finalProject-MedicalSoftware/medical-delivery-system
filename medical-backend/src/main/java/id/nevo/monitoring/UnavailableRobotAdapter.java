package id.nevo.monitoring;

import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Explicit fail-closed adapter until ROS/Gazebo and physical adapters are approved and implemented.
 */
@Service
@ConditionalOnExpression("'${nevo.robot.mode:sim}' == 'gazebo' or '${nevo.robot.mode:sim}' == 'real'")
public class UnavailableRobotAdapter implements RobotAdapter {
    private final String mode;

    public UnavailableRobotAdapter(org.springframework.core.env.Environment environment) {
        this.mode = environment.getProperty("nevo.robot.mode", "unknown");
    }

    @Override
    public List<Map<String, Object>> getRobots() {
        throw unavailable();
    }

    @Override
    public void executeCommand(UUID commandId, String robotId, String command, String userName, Map<String, Object> params) {
        throw unavailable();
    }

    private ResponseStatusException unavailable() {
        return new ResponseStatusException(
                HttpStatus.SERVICE_UNAVAILABLE,
                "ROBOT_MODE=" + mode + " belum memiliki adapter operasional");
    }
}
