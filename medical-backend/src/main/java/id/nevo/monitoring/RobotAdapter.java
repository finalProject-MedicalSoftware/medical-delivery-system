package id.nevo.monitoring;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Titik tukar eksekusi perintah downlink & daftar robot
 * (kontrak docs/api-contracts/robot-command.md).
 * ROBOT_MODE=sim -> SimulatedRobotService; ROBOT_MODE=real -> adapter robot sungguhan (fase robot).
 */
public interface RobotAdapter {
    List<Map<String, Object>> getRobots();

    void executeCommand(UUID commandId, String robotId, String command, String userName, Map<String, Object> params);
}
