package id.nevo.monitoring;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** Lapisan REST MissionApi.sendCommand (400/404/202); tanpa DB/ROS nyata. */
class RobotCommandRestP1Test {
    private static final String SQL = "SELECT count(*) FROM m_robot WHERE robot_id = ?";

    private final JdbcTemplate db = mock(JdbcTemplate.class);
    private final RobotAdapter adapter = mock(RobotAdapter.class);
    @SuppressWarnings("unchecked")
    private final ObjectProvider<SimulatedRobotService> provider = mock(ObjectProvider.class);
    private final Authentication user = mock(Authentication.class);
    private final MissionApi api = new MissionApi(db, provider, adapter, null, null);

    RobotCommandRestP1Test() {
        when(user.getName()).thenReturn("operator");
    }

    private void robotExists(int count) {
        when(db.queryForObject(SQL, Integer.class, "NEVO-01")).thenReturn(count);
    }

    private HttpStatus statusOf(String command, Map<String, Object> params) {
        var ex = assertThrows(ResponseStatusException.class,
                () -> api.sendCommand("NEVO-01", new MissionApi.CommandReq(command, params), user));
        return HttpStatus.valueOf(ex.getStatusCode().value());
    }

    @Test
    void unknownNullOrMissingBodyIs400AndNeverExecutes() {
        robotExists(1);
        assertEquals(HttpStatus.BAD_REQUEST, statusOf("CMD_DANCE", null));
        assertEquals(HttpStatus.BAD_REQUEST, statusOf(null, null));
        assertThrows(ResponseStatusException.class, () -> api.sendCommand("NEVO-01", null, user));
        verifyNoInteractions(adapter);
    }

    @Test
    void unknownRobotIs404AndNeverExecutes() {
        robotExists(0);
        assertEquals(HttpStatus.NOT_FOUND, statusOf("CMD_CANCEL_MISSION", null));
        when(db.queryForObject(SQL, Integer.class, "NEVO-01")).thenReturn(null);
        assertEquals(HttpStatus.NOT_FOUND, statusOf("CMD_CANCEL_MISSION", null));
        verifyNoInteractions(adapter);
    }

    @Test
    void fourValidCommandsReturnCommandIdAndForwardToAdapter() {
        robotExists(1);
        for (String cmd : Set.of("CMD_CANCEL_MISSION", "CMD_RETURN_TO_DOCK", "CMD_TELEOP_DRIVE", "CMD_SET_SPEED")) {
            Map<String, Object> params = cmd.equals("CMD_SET_SPEED") ? Map.of("speed", 1.0) : null;
            var res = api.sendCommand("NEVO-01", new MissionApi.CommandReq(cmd, params), user);

            UUID id = UUID.fromString((String) res.get("commandId"));
            assertEquals(false, res.get("simulated")); // adapter bukan SimulatedRobotService
            verify(adapter).executeCommand(eq(id), eq("NEVO-01"), eq(cmd), eq("operator"),
                    eq(params == null ? Map.of() : params));
        }
    }

    @Test
    void simulatedFlagTrueWhenAdapterIsSimulator() {
        SimulatedRobotService sim = mock(SimulatedRobotService.class);
        when(provider.getIfAvailable()).thenReturn(sim);
        var simApi = new MissionApi(db, provider, sim, null, null);
        robotExists(1);

        var res = simApi.sendCommand("NEVO-01", new MissionApi.CommandReq("CMD_RETURN_TO_DOCK", null), user);

        assertEquals(true, res.get("simulated"));
    }

    // --- cancelMission: jalur antrian & jalur aktif (tanpa DB/ROS nyata) ---

    @Test
    void cancelQueuedMissionMarksCancelledAndBroadcasts() {
        var ws = mock(RobotWebSocketHandler.class);
        var sim = new SimulatedRobotService(db, ws, null, new ObjectMapper());
        UUID id = UUID.randomUUID();
        when(db.queryForObject(anyString(), eq(Integer.class), eq(id))).thenReturn(1);
        when(db.queryForList(anyString(), eq(id)))
                .thenReturn(List.of(Map.of("request_code", "REQ-1", "room_code", "R1")));

        var res = sim.cancelMission(id, "operator");

        assertEquals(true, res.get("cancelled"));
        verify(db, atLeastOnce()).update(anyString(), any(Object[].class));
        verify(ws).broadcast(eq("MISSION_EVENT"), any());
    }

    @Test
    void cancelUnknownMissionIsRejected() {
        var sim = new SimulatedRobotService(db, mock(RobotWebSocketHandler.class), null, new ObjectMapper());
        when(db.queryForObject(anyString(), eq(Integer.class), any(UUID.class))).thenReturn(0);

        assertThrows(IllegalArgumentException.class, () -> sim.cancelMission(UUID.randomUUID(), "operator"));
    }

    @Test
    void cancelActiveMissionResetsRobotAndBroadcasts() {
        var ws = mock(RobotWebSocketHandler.class);
        var sim = new SimulatedRobotService(db, ws, null, new ObjectMapper());
        UUID id = UUID.randomUUID();
        ReflectionTestUtils.setField(sim, "activeMissionId", id);
        ReflectionTestUtils.setField(sim, "status", "DELIVERING");

        var res = sim.cancelMission(id, "operator");

        assertEquals(true, res.get("cancelled"));
        assertEquals("IDLE", ReflectionTestUtils.getField(sim, "status"));
        assertNull(ReflectionTestUtils.getField(sim, "activeMissionId"));
        verify(ws).broadcast(eq("MISSION_EVENT"), any());
    }
}
