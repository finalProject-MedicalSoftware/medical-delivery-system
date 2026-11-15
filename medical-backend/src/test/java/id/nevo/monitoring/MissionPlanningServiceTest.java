package id.nevo.monitoring;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class MissionPlanningServiceTest {
    private final UUID waypointId = UUID.randomUUID();

    @Test
    void rejectsDuplicatePatientAndCompartment() {
        var a = item("MRN-1", 0, "2026-11-06T00:00:00Z", null);
        var duplicatePatient = item("MRN-1", 1, "2026-11-06T00:00:00Z", null);
        var duplicateCompartment = item("MRN-2", 0, "2026-11-06T00:00:00Z", null);
        assertThrows(ResponseStatusException.class, () -> MissionPlanningService.validateShape(List.of(a, duplicatePatient), 6));
        assertThrows(ResponseStatusException.class, () -> MissionPlanningService.validateShape(List.of(a, duplicateCompartment), 6));
    }

    @Test
    void rejectsChangedPlacementAndMissingBedWaypoint() throws Exception {
        Fixture fixture = fixture();
        var wrongRoom = new MissionPlanningService.ManifestItem("MRN-1", "ROOM-OTHER", "BED-1",
                "2026-11-06T00:00:00Z", waypointId, 0, null);
        ResponseStatusException moved = assertThrows(ResponseStatusException.class,
                () -> fixture.service.dispatch(request(wrongRoom), "operator"));
        assertEquals(409, moved.getStatusCode().value());

        var stale = request(item("MRN-1", 0, "2026-11-05T00:00:00Z", null));
        ResponseStatusException changed = assertThrows(ResponseStatusException.class, () -> fixture.service.dispatch(stale, "operator"));
        assertEquals(409, changed.getStatusCode().value());

        when(fixture.db.queryForObject(anyString(), eq(Integer.class), any(), any(), any())).thenReturn(0);
        ResponseStatusException missing = assertThrows(ResponseStatusException.class,
                () -> fixture.service.dispatch(request(item("MRN-1", 0, "2026-11-06T00:00:00Z", null)), "operator"));
        assertEquals(409, missing.getStatusCode().value());
        verify(fixture.db).queryForObject(contains("w.bed_id=?"), eq(Integer.class), eq(waypointId), eq("ROOM-1"), eq("BED-1"));
    }

    @Test
    void acceptsManualSimrsMissionWithoutInventingRequestCode() throws Exception {
        Fixture fixture = fixture();
        when(fixture.db.queryForObject(anyString(), eq(Integer.class), any(), any(), any())).thenReturn(1);
        when(fixture.simulator.dispatchMission(any(), anyString(), anyString(), isNull(), eq(0), eq("MRN-1"), eq("BED-1"), any(), eq("MANUAL_SIMRS"), any(), eq(1)))
                .thenReturn(Map.of("missionId", UUID.randomUUID(), "status", "EXECUTING"));

        Map<String, Object> result = fixture.service.dispatch(
                request(item("MRN-1", 0, "2026-11-06T00:00:00Z", null)), "operator");
        assertEquals("ACCEPTED", result.get("status"));
        verify(fixture.simulator).dispatchMission(any(), eq("ROOM-1"), eq("operator"), isNull(), eq(0),
                eq("MRN-1"), eq("BED-1"), any(), eq("MANUAL_SIMRS"), any(), eq(1));
    }

    private Fixture fixture() throws Exception {
        JdbcTemplate db = mock(JdbcTemplate.class);
        SimrsClientService simrs = mock(SimrsClientService.class);
        SimulatedRobotService simulator = mock(SimulatedRobotService.class);
        @SuppressWarnings("unchecked") ObjectProvider<SimulatedRobotService> provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(simulator);
        when(simulator.getRobotState()).thenReturn(Map.of("robotId", "NEVO-01", "status", "IDLE"));
        when(simulator.getCompartmentCount()).thenReturn(6);
        when(simrs.getPatient("MRN-1")).thenReturn(new ObjectMapper().readTree("""
                {"patient":{"mrn":"MRN-1","active":true,"roomCode":"ROOM-1","bedId":"BED-1","placementUpdatedAt":"2026-11-06T00:00:00Z"},"activeDeliveries":[]}
                """));
        return new Fixture(db, simulator, new MissionPlanningService(db, simrs, provider));
    }

    private MissionPlanningService.ManifestRequest request(MissionPlanningService.ManifestItem item) {
        return new MissionPlanningService.ManifestRequest("NEVO-01", List.of(item));
    }

    private MissionPlanningService.ManifestItem item(String mrn, int compartment, String updatedAt, String requestCode) {
        return new MissionPlanningService.ManifestItem(mrn, "ROOM-1", "BED-1", updatedAt, waypointId, compartment, requestCode);
    }

    private record Fixture(JdbcTemplate db, SimulatedRobotService simulator, MissionPlanningService service) { }
}
