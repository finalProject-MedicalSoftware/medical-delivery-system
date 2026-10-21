package id.nevo.monitoring;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {

    private final RobotWebSocketHandler robotHandler;

    public WebSocketConfig(RobotWebSocketHandler robotHandler) {
        this.robotHandler = robotHandler;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(robotHandler, "/ws/robot")
                .setAllowedOrigins("*");
    }
}
