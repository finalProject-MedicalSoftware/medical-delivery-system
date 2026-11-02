package id.nevo.monitoring;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.Map;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class RobotCommandP1Test {
    private final JdbcTemplate db = mock(JdbcTemplate.class);
    private final RobotWebSocketHandler ws = mock(RobotWebSocketHandler.class);
    private final SimulatedRobotService simulator = new SimulatedRobotService(db, ws, null, new ObjectMapper());

    @Test
    void setSpeedAcceptsBoundaryValuesAndPublishesSimulatedResult() {
        UUID id = UUID.randomUUID();

        simulator.executeCommand(id, "NEVO-01", "CMD_SET_SPEED", "operator", Map.of("speed", 2.0));

        verify(ws).publishCommand("ROBOT_COMMAND_RESULT", Map.of(
                "commandId", id, "robotId", "NEVO-01", "result", "OK", "reason", ""));
    }

    @Test
    void setSpeedRejectsOutOfRangeValue() {
        UUID id = UUID.randomUUID();

        simulator.executeCommand(id, "NEVO-01", "CMD_SET_SPEED", "operator", Map.of("speed", 2.1));

        verify(ws).publishCommand("ROBOT_COMMAND_RESULT", Map.of(
                "commandId", id, "robotId", "NEVO-01", "result", "REJECTED", "reason", "INVALID_PARAMS"));
    }

    @Test
    void teleopDriveRejectsOutOfRangeInput() {
        UUID id = UUID.randomUUID();

        simulator.executeCommand(id, "NEVO-01", "CMD_TELEOP_DRIVE", "operator",
                Map.of("linear", 1.1, "angular", 0.0));

        verify(ws).publishCommand("ROBOT_COMMAND_RESULT", Map.of(
                "commandId", id, "robotId", "NEVO-01", "result", "REJECTED", "reason", "INVALID_PARAMS"));
    }

    @Test
    void teleopDriveAcceptsBoundaryValuesAndUpdatesSimulatedPose() {
        UUID id = UUID.randomUUID();
        double oldX = -5.0;

        simulator.executeCommand(id, "NEVO-01", "CMD_TELEOP_DRIVE", "operator",
                Map.of("linear", 1.0, "angular", 0.0));

        verify(ws).publishCommand("ROBOT_COMMAND_RESULT", Map.of(
                "commandId", id, "robotId", "NEVO-01", "result", "OK", "reason", ""));
        Map<?, ?> pose = (Map<?, ?>) simulator.getRobotState().get("pose");
        org.junit.jupiter.api.Assertions.assertEquals(oldX + 0.5, ((Number) pose.get("x")).doubleValue(), 0.001);
    }

    @Test
    void returnToDockDispatchesARegularSimulatedMission() {
        UUID commandId = UUID.randomUUID();
        UUID waypointId = UUID.randomUUID();
        when(db.queryForList(contains("FROM m_waypoint"), eq(waypointId))).thenReturn(java.util.List.of(
                Map.of("name", "Dock", "x", 0.0, "y", 0.0, "yaw", 0.0)));
        when(db.queryForList(contains("m_simrs_room_directory"), any(Object[].class))).thenReturn(java.util.List.of());

        simulator.executeCommand(commandId, "NEVO-01", "CMD_RETURN_TO_DOCK", "operator",
                Map.of("waypointId", waypointId.toString()));

        verify(ws).publishCommand("ROBOT_COMMAND_RESULT", Map.of(
                "commandId", commandId, "robotId", "NEVO-01", "result", "OK", "reason", ""));
        verify(db).update(contains("INSERT INTO t_mission"), any(), eq("NEVO-01"), eq(waypointId), eq(""),
                eq("operator"), eq(""));
    }

    @Test
    void cancelMissionRejectsMissingOrInactiveMission() {
        UUID commandId = UUID.randomUUID();
        UUID missionId = UUID.randomUUID();
        when(db.queryForObject(contains("status='QUEUED'"), eq(Integer.class), eq(missionId))).thenReturn(0);

        simulator.executeCommand(commandId, "NEVO-01", "CMD_CANCEL_MISSION", "operator",
                Map.of("missionId", missionId.toString()));

        verify(ws).publishCommand("ROBOT_COMMAND_RESULT", Map.of(
                "commandId", commandId, "robotId", "NEVO-01", "result", "REJECTED", "reason", "INVALID_PARAMS"));
    }

    @Test
    void unknownRobotIsRejected() {
        UUID id = UUID.randomUUID();

        simulator.executeCommand(id, "UNKNOWN", "CMD_SET_SPEED", "operator", Map.of("speed", 1.0));

        verify(ws).publishCommand("ROBOT_COMMAND_RESULT", Map.of(
                "commandId", id, "robotId", "UNKNOWN", "result", "REJECTED", "reason", "UNKNOWN_ROBOT"));
    }
}
