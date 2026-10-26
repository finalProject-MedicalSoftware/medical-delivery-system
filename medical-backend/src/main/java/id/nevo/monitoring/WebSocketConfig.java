package id.nevo.monitoring;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {

    private final RobotWebSocketHandler robotHandler;
    private final String[] allowedOrigins;

    public WebSocketConfig(RobotWebSocketHandler robotHandler,
                           @Value("${nevo.ws.allowed-origins:}") String allowedOrigins) {
        this.robotHandler = robotHandler;
        this.allowedOrigins = allowedOrigins.isBlank()
                ? new String[0]
                : allowedOrigins.split("\\s*,\\s*");
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        var registration = registry.addHandler(robotHandler, "/ws/robot");
        if (allowedOrigins.length > 0) {
            registration.setAllowedOrigins(allowedOrigins);
        }
    }
}
