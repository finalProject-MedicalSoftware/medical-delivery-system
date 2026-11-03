package id.nevo.monitoring;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Meneruskan event ke gateway medical-ws (POST /internal/publish) agar web monitoring
 * dan HMI cukup berlangganan satu kanal WebSocket.
 *
 * Non-blocking (HttpClient.sendAsync) karena dipanggil dari ticker 500 ms.
 * ponytail: bridge HTTP ini pengganti Kafka; ganti ke Kafka cukup di sisi medical-ws.
 */
@Component
public class InternalPublisher {
    private static final Logger log = LoggerFactory.getLogger(InternalPublisher.class);

    private final ObjectMapper json;
    // HTTP_1_1 penting: default HTTP_2 mengirim header Upgrade "h2c" pada http
    // plaintext, dan gateway medical-ws (Node/ws) menolaknya dengan HTTP 405.
    private final HttpClient http = HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_1_1)
            .build();
    private final String url;
    private final String secret;

    public InternalPublisher(ObjectMapper json,
                             @Value("${nevo.internal-publish.url:}") String url,
                             @Value("${nevo.internal-publish.secret:}") String secret) {
        this.json = json;
        this.url = url;
        this.secret = secret;
    }

    /**
     * @param type jenis event (mis. MISSION_EVENT)
     * @param data payload; wajib memuat requestCode + wardCode non-blank agar bisa dirutekan.
     */
    public void publish(String type, Object data) {
        if (!(data instanceof Map<?, ?> map)) return;
        Object requestCode = map.get("requestCode");
        Object wardCode = map.get("wardCode");
        if (!nonBlank(requestCode) || !nonBlank(wardCode)) return;
        send(type, data, requestCode, wardCode);
    }

    /** Tipe downlink perintah robot: requestCode/wardCode boleh kosong (kontrak robot-command.md). */
    public void publishCommand(String type, Object data) {
        send(type, data, "", "");
    }

    /** true bila bridge gateway terkonfigurasi (URL + secret non-blank); dipakai gate 503 mode real. */
    public boolean isConfigured() {
        return url != null && !url.isBlank() && secret != null && !secret.isBlank();
    }

    private void send(String type, Object data, Object requestCode, Object wardCode) {
        if (url == null || url.isBlank() || secret == null || secret.isBlank()) return;

        Map<String, Object> envelope = new LinkedHashMap<>();
        envelope.put("v", 1);
        envelope.put("eventId", UUID.randomUUID().toString());
        envelope.put("type", type);
        envelope.put("occurredAt", Instant.now().toString());
        envelope.put("requestCode", requestCode);
        envelope.put("wardCode", wardCode);
        envelope.put("data", data);

        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofSeconds(3))
                    .header("Content-Type", "application/json")
                    .header("X-Internal-Secret", secret)
                    .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(envelope)))
                    .build();
            http.sendAsync(request, HttpResponse.BodyHandlers.discarding())
                    .thenAccept(res -> {
                        if (res.statusCode() >= 300) {
                            log.warn("internal-publish ditolak: HTTP {}", res.statusCode());
                        }
                    })
                    .exceptionally(e -> {
                        log.warn("internal-publish gagal: {}", e.getMessage());
                        return null;
                    });
        } catch (Exception e) {
            log.warn("internal-publish gagal: {}", e.getMessage());
        }
    }

    private static boolean nonBlank(Object value) {
        return value instanceof String s && !s.isBlank();
    }
}
