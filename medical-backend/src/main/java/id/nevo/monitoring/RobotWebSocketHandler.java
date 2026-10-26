package id.nevo.monitoring;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * High-performance WebSocket handler for real-time robot telemetry and mission event streaming.
 */
@Component
public class RobotWebSocketHandler extends TextWebSocketHandler {
    private static final Logger log = LoggerFactory.getLogger(RobotWebSocketHandler.class);
    private final Set<WebSocketSession> sessions = ConcurrentHashMap.newKeySet();
    private final ObjectMapper json = new ObjectMapper();
    private final InternalPublisher publisher;

    public RobotWebSocketHandler(InternalPublisher publisher) {
        this.publisher = publisher;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        sessions.add(session);
        log.info("WebSocket client connected: {}", session.getId());
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        sessions.remove(session);
        log.info("WebSocket client disconnected: {}, status: {}", session.getId(), status);
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        log.warn("WebSocket transport error for session {}: {}", session.getId(), exception.getMessage());
        sessions.remove(session);
    }

    public void broadcast(String type, Object data) {
        // Teruskan ke gateway lebih dulu: broadcast lokal boleh tidak punya klien sama sekali.
        publisher.publish(type, data);
        deliverLocal(type, data);
    }

    /** Tipe downlink perintah robot (kontrak robot-command.md): ke gateway + klien WS lokal. */
    public void publishCommand(String type, Object data) {
        publisher.publishCommand(type, data);
        deliverLocal(type, data);
    }

    private void deliverLocal(String type, Object data) {
        if (sessions.isEmpty()) return;
        try {
            String payload = json.writeValueAsString(Map.of("type", type, "data", data));
            TextMessage message = new TextMessage(payload);
            for (WebSocketSession session : sessions) {
                if (session.isOpen()) {
                    synchronized (session) {
                        session.sendMessage(message);
                    }
                }
            }
        } catch (IOException e) {
            log.error("Failed to broadcast WebSocket message", e);
        }
    }

    public int getActiveSessionCount() {
        return sessions.size();
    }
}
