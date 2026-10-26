package id.nevo.monitoring;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicBoolean;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

public class SimrsClientServiceTest {

    @Test
    @DisplayName("Prohibit MOCK_HANDOVER_CONFIRMED from monitoring service")
    void testProhibitHandoverConfirmed() {
        SimrsClientService service = new SimrsClientService("https://mock.invalid", "mock-token", true, true, 30);
        assertThrows(IllegalArgumentException.class, () ->
                service.postDeliveryStatus("REQ-123", "MOCK_HANDOVER_CONFIRMED", null, "idemp-1")
        );
    }

    @Test
    @DisplayName("Write feature disabled by default returns simulation response")
    void testWriteFeatureDisabledByDefault() {
        SimrsClientService service = new SimrsClientService("https://mock.invalid", "", true, false, 30);
        Map<String, Object> res = service.postDeliveryStatus("REQ-123", "MOCK_IN_TRANSIT", null, "idemp-1");
        assertTrue((Boolean) res.get("simulated"));
        assertTrue((Boolean) res.get("success"));
    }

    @Test
    @DisplayName("Failed SIMRS read never creates synthetic live deliveries")
    void testFailedReadKeepsCacheWithoutSyntheticData() {
        SimrsClientService service = new SimrsClientService("https://mock.invalid", "", true, false, 30);
        List<Map<String, Object>> deliveries = service.getActiveDeliveries();
        assertNotNull(deliveries);
        assertTrue(deliveries.isEmpty());
    }

    @Test
    @DisplayName("Polling mock server reads mapping, snapshot and active deliveries")
    void testAutomaticPollAgainstMockServer() throws Exception {
        AtomicInteger calls = new AtomicInteger();
        HttpServer server = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
        server.createContext("/api/v1/monitoring/mapping", e -> respond(e, "application/yaml", "version: 1\nsource: simrs-dummy\nwards:\n  - code: W1\n    name: Ward 1\n    floor: 1\n    rooms:\n      - roomCode: R1\n        name: Room 1\n        beds: []\n" , calls));
        server.createContext("/api/v1/monitoring/snapshot", e -> respond(e, "application/json", "{\"patients\":[],\"deliveries\":[],\"rooms\":[]}", calls));
        server.createContext("/api/v1/monitoring/active-deliveries", e -> respond(e, "application/json", "{\"generatedAt\":\"2026-01-01T00:00:00Z\",\"count\":1,\"deliveries\":[{\"requestCode\":\"D1\",\"status\":\"MOCK_IN_TRANSIT\"}]}", calls));
        server.start();
        try {
            SimrsClientService service = new SimrsClientService("http://localhost:" + server.getAddress().getPort(), "token", true, false, 30);
            service.pollAll();
            assertEquals("CONNECTED", service.getConnectionStatus().get("code"));
            assertEquals(3, calls.get());
            assertEquals("D1", service.getActiveDeliveries().get(0).get("requestCode"));
        } finally { server.stop(0); }
    }

    @Test
    @DisplayName("Successful cache is preserved when the next poll fails")
    void testCachePreservedOnFailure() throws Exception {
        AtomicBoolean fail = new AtomicBoolean(false);
        HttpServer server = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
        String mapping = "version: 1\nsource: simrs-dummy\nwards:\n  - code: W1\n    name: Ward 1\n    floor: 1\n    rooms:\n      - roomCode: R1\n        name: Room 1\n        beds: []\n";
        server.createContext("/api/v1/monitoring/mapping", e -> { if (fail.get()) respondStatus(e, 503); else respond(e, "application/yaml", mapping, new AtomicInteger()); });
        server.createContext("/api/v1/monitoring/snapshot", e -> { if (fail.get()) respondStatus(e, 503); else respond(e, "application/json", "{\"patients\":[],\"deliveries\":[],\"rooms\":[]}", new AtomicInteger()); });
        server.createContext("/api/v1/monitoring/active-deliveries", e -> { if (fail.get()) respondStatus(e, 503); else respond(e, "application/json", "{\"deliveries\":[{\"requestCode\":\"D1\"}]}", new AtomicInteger()); });
        server.start();
        try {
            SimrsClientService service = new SimrsClientService("http://localhost:" + server.getAddress().getPort(), "token", true, false, 30);
            service.pollAll();
            assertEquals("D1", service.getActiveDeliveries().get(0).get("requestCode"));
            fail.set(true);
            service.pollAll();
            assertEquals("STALE", service.getConnectionStatus().get("code"));
            assertEquals("D1", service.getActiveDeliveries().get(0).get("requestCode"));
        } finally { server.stop(0); }
    }

    @Test
    @DisplayName("401 is exposed as AUTH_ERROR")
    void testAuthError() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
        var unauthorized = (com.sun.net.httpserver.HttpHandler) e -> respondStatus(e, 401);
        server.createContext("/api/v1/monitoring/mapping", unauthorized);
        server.createContext("/api/v1/monitoring/snapshot", unauthorized);
        server.createContext("/api/v1/monitoring/active-deliveries", unauthorized);
        server.start();
        try {
            SimrsClientService service = new SimrsClientService("http://localhost:" + server.getAddress().getPort(), "token", true, false, 30);
            service.pollAll();
            assertEquals("AUTH_ERROR", service.getConnectionStatus().get("code"));
        } finally { server.stop(0); }
    }

    private static void respond(HttpExchange exchange, String type, String body, AtomicInteger calls) throws java.io.IOException {
        calls.incrementAndGet();
        assertEquals("token", exchange.getRequestHeaders().getFirst("x-monitoring-token"));
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", type);
        exchange.sendResponseHeaders(200, bytes.length);
        try (var out = exchange.getResponseBody()) { out.write(bytes); }
    }

    private static void respondStatus(HttpExchange exchange, int status) throws java.io.IOException {
        exchange.sendResponseHeaders(status, -1);
        exchange.close();
    }

    @Test
    @DisplayName("Status reports TOKEN_NOT_CONFIGURED when token is blank")
    void testStatusWithoutToken() {
        SimrsClientService service = new SimrsClientService("https://mock.invalid", "", true, false, 30);
        Map<String, Object> status = service.getConnectionStatus();
        assertEquals("MISCONFIGURED", status.get("mode"));
        assertEquals("INVALID_CONFIGURATION", status.get("code"));
    }
}
