package id.nevo.monitoring;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class RealMissionServiceTest {
    private final JdbcTemplate db = mock(JdbcTemplate.class);
    private final InternalPublisher publisher = mock(InternalPublisher.class);
    private final SimrsClientService simrs = mock(SimrsClientService.class);
    private final RealMissionService service = new RealMissionService(db, publisher, simrs, 6, 60, "0.5, -1.0, 1.57");
    private final UUID missionId = UUID.randomUUID();

    @Test
    void parsesHomeBaseOrIgnoresBrokenValue() {
        assertEquals(Map.of("x", 0.5, "y", -1.0, "yaw", 1.57), RealMissionService.parseHomeBase("0.5, -1.0, 1.57"));
        assertNull(RealMissionService.parseHomeBase(""));
        assertNull(RealMissionService.parseHomeBase("1,2"));
        assertNull(RealMissionService.parseHomeBase("a,b,c"));
    }

    @Test
    void goalCompleteMarksMissionSucceededAndReportsArrivalWithCompartment() {
        when(simrs.isWriteLive()).thenReturn(true);
        when(simrs.postDeliveryStatus(any(), any(), any(), any(), any())).thenReturn(Map.of("httpStatus", 200));
        when(db.queryForList(contains("manifest_sequence=?"), eq("TFRB5"), eq(2)))
                .thenReturn(List.of(Map.of("id", missionId, "request_code", "DELIV-1", "room_code", "R-1", "compartment_no", 3)));
        when(db.update(contains("status='SUCCEEDED'"), eq(missionId))).thenReturn(1);

        service.onRobotEvent("GOAL_COMPLETE", Map.of("robot_id", "TFRB5", "sequence", 2));

        verify(simrs, timeout(2000)).postDeliveryStatus(eq("DELIV-1"), eq("ARRIVED_AT_ROOM"), anyString(), eq(3), contains(":ARRIVED_AT_ROOM"));
        verify(publisher).publish(eq("MISSION_EVENT"), argThat(m -> m instanceof Map<?, ?> x && "SUCCEEDED".equals(x.get("status"))));
    }

    @Test
    void goalCompleteWithoutExecutingMissionIsIgnored() {
        when(db.queryForList(contains("manifest_sequence=?"), eq("TFRB5"), eq(1))).thenReturn(List.of());
        service.onRobotEvent("GOAL_COMPLETE", Map.of("robot_id", "TFRB5", "sequence", 1));
        verify(simrs, never()).postDeliveryStatus(any(), any(), any(), any(), any());
        verify(db, never()).update(contains("SUCCEEDED"), any(Object[].class));
    }

    @Test
    void homeGoalCompleteIsIgnored() {
        service.onRobotEvent("GOAL_COMPLETE", Map.of("robot_id", "TFRB5", "sequence", -1));
        verifyNoInteractions(simrs);
        verify(db, never()).queryForList(anyString(), any(Object[].class));
    }

    @Test
    void opEnqueuedAckStartsPendingMissionsAndReportsInTransit() {
        when(simrs.isWriteLive()).thenReturn(true);
        when(simrs.postDeliveryStatus(any(), any(), any(), any(), any())).thenReturn(Map.of("httpStatus", 200));
        when(db.queryForList(contains("status IN ('BACKEND_ACCEPTED','ROBOT_ACKNOWLEDGED')"), eq("TFRB5")))
                .thenReturn(List.of(Map.of("id", missionId, "request_code", "DELIV-9", "room_code", "R-2")));

        service.onRobotEvent("ACK", Map.of("robot_id", "TFRB5", "command_id", "OP", "status", "ENQUEUED"));

        verify(db).update(contains("status='EXECUTING'"), eq(missionId));
        verify(simrs, timeout(2000)).postDeliveryStatus(eq("DELIV-9"), eq("IN_TRANSIT"), anyString(), isNull(), anyString());
    }

    @Test
    void ackForOtherCommandsDoesNothing() {
        service.onRobotEvent("ACK", Map.of("robot_id", "TFRB5", "command_id", "INTERRUPT", "status", "ACCEPTED"));
        verifyNoInteractions(simrs);
        verify(db, never()).update(anyString(), any(Object[].class));
    }

    @Test
    void dispatchSendsOneOpCommandWithOrderedTrayTasksAndHomeBase() {
        UUID wp = UUID.randomUUID();
        when(db.queryForList(contains("FROM m_waypoint"), eq(wp))).thenReturn(List.of(Map.of("name", "Bed A", "x", 1.5, "y", 2.0, "yaw", 0.0)));
        var stops = List.of(
                new RealMissionService.Stop(wp, "R-1", "BED-1", "MRN-1", "DELIV-1", 0, null, "SIMRS_REQUEST"),
                new RealMissionService.Stop(wp, "R-1", "BED-2", "MRN-2", "DELIV-2", 1, null, "SIMRS_REQUEST"));

        Map<String, Object> result = service.dispatchManifest("TFRB5", stops, "op", UUID.randomUUID());

        assertEquals("ACCEPTED", result.get("status"));
        ArgumentCaptor<Object> cmd = ArgumentCaptor.forClass(Object.class);
        verify(publisher).publishCommandChecked(cmd.capture());
        @SuppressWarnings("unchecked") Map<String, Object> c = (Map<String, Object>) cmd.getValue();
        assertEquals("CMD_DISPATCH_OP", c.get("command"));
        assertEquals("TFRB5", c.get("robotId"));
        @SuppressWarnings("unchecked") Map<String, Object> params = (Map<String, Object>) c.get("params");
        assertEquals(2, ((List<?>) params.get("trayTasks")).size());
        assertEquals(Map.of("x", 0.5, "y", -1.0, "yaw", 1.57), params.get("homeBase"));
    }

    @Test
    void gatewayRejectionFailsAllMissionsAndPropagates() {
        UUID wp = UUID.randomUUID();
        when(db.queryForList(contains("FROM m_waypoint"), eq(wp))).thenReturn(List.of(Map.of("name", "Bed A", "x", 1.0, "y", 1.0, "yaw", 0.0)));
        doThrow(new ResponseStatusException(HttpStatus.CONFLICT, "Gateway menolak command")).when(publisher).publishCommandChecked(any());
        var stops = List.of(new RealMissionService.Stop(wp, "R-1", "BED-1", "MRN-1", null, 0, null, "MANUAL_SIMRS"));

        assertThrows(ResponseStatusException.class, () -> service.dispatchManifest("TFRB5", stops, "op", UUID.randomUUID()));
        verify(db).update(contains("status='FAILED'"), any(UUID.class));
    }

    @Test
    void unverifiedRobotCannotBeDispatched() {
        when(db.queryForList(contains("registration_status"), eq(String.class), eq("TFRB5"))).thenReturn(List.of("DRAFT"));
        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () -> service.requireDispatchable("TFRB5"));
        assertEquals(409, ex.getStatusCode().value());
    }

    @Test
    void cancelMarksActiveMissionsCancelledAndNotifiesSimrs() {
        when(simrs.isWriteLive()).thenReturn(true);
        when(simrs.postDeliveryStatus(any(), any(), any(), any(), any())).thenReturn(Map.of("httpStatus", 200));
        when(db.queryForList(contains("status IN ('BACKEND_ACCEPTED','ROBOT_ACKNOWLEDGED','EXECUTING')"), eq("TFRB5")))
                .thenReturn(List.of(Map.of("id", missionId, "request_code", "DELIV-3", "room_code", "R-1")));

        service.cancelActive("TFRB5", "operator");

        verify(db).update(contains("status='CANCELLED'"), eq(missionId));
        verify(simrs, timeout(2000)).postDeliveryStatus(eq("DELIV-3"), eq("CANCELLED"), anyString(), isNull(), anyString());
    }

    @Test
    void pickupNotCollectedReportsNotCollectedToSimrs() {
        when(simrs.isWriteLive()).thenReturn(true);
        when(simrs.postDeliveryStatus(any(), any(), any(), any(), any())).thenReturn(Map.of("httpStatus", 200));
        when(db.queryForList(contains("m.status='SUCCEEDED' AND m.manifest_sequence=?"), eq("TFRB5"), eq(1)))
                .thenReturn(List.of(Map.of("id", missionId, "request_code", "DELIV-5", "room_code", "R-1")));

        service.onRobotEvent("PICKUP_CONFIRM", Map.of("robot_id", "TFRB5", "sequence", 1, "method", "TIMEOUT", "collected", false));

        verify(simrs, timeout(2000)).postDeliveryStatus(eq("DELIV-5"), eq("NOT_COLLECTED"), anyString(), isNull(), contains(":NOT_COLLECTED"));
    }

    @Test
    void pickupCollectedDoesNotTouchSimrs() {
        when(db.queryForList(contains("m.status='SUCCEEDED' AND m.manifest_sequence=?"), eq("TFRB5"), eq(1)))
                .thenReturn(List.of(Map.of("id", missionId, "request_code", "DELIV-5", "room_code", "R-1")));

        service.onRobotEvent("PICKUP_CONFIRM", Map.of("robot_id", "TFRB5", "sequence", 1, "method", "CAMERA", "collected", true));

        verifyNoInteractions(simrs);
    }
}
