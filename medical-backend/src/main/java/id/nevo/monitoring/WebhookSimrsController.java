package id.nevo.monitoring;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Receiver untuk webhook keluaran SIMRS Dummy.
 * Kontrak: POST /webhooks/simrs dengan header x-simrs-token dan body Envelope outbox (V1).
 * Dedupe via eventId (UNIQUE constraint). Idempotent — duplikat langsung OK agar relay tidak retry forever.
 */
@RestController
@RequestMapping("/webhooks")
public class WebhookSimrsController {

    private static final Logger log = LoggerFactory.getLogger(WebhookSimrsController.class);

    private final JdbcTemplate db;
    private final String webhookToken;

    public WebhookSimrsController(JdbcTemplate db, SimrsProperties props) {
        this.db = db;
        this.webhookToken = props.getWebhookToken();
    }

    @PostMapping("/simrs")
    public ResponseEntity<Map<String, Object>> receive(
            @RequestHeader("x-simrs-token") String token,
            @RequestBody Map<String, Object> payload) {

        // Validasi token
        if (webhookToken == null || webhookToken.isBlank() || !webhookToken.equals(token)) {
            log.warn("[webhook-simrs] token salah/dihilangkan dari {} (prefix {})",
                    "unknown", token != null && token.length() >= 4 ? token.substring(0, 4) : "null");
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "invalid token"));
        }

        // Pars envelope
        Object v = payload.get("v");
        Object eventId = payload.get("eventId");
        Object idempotencyKey = payload.get("idempotencyKey");
        Object type = payload.get("type");
        Object occurredAt = payload.get("occurredAt");
        Object requestCode = payload.get("requestCode");
        Object data = payload.get("data");

        if (eventId == null || !isValidUuid(String.valueOf(eventId))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "eventId wajib UUID");
        }
        if (type == null || String.valueOf(type).isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "type wajib diisi");
        }

        try {
            // Simpan event (dedupe otomatis oleh UNIQUE eventId)
            ObjectMapper mapper = new ObjectMapper();
            String payloadJson = mapper.writeValueAsString(payload);
            db.update(
                    "INSERT INTO h_webhook_simrs_event (event_id, idempotency_key, type, occurred_at, request_code, payload, received_at) VALUES (?, ?, ?, ?, ?, CAST(? AS jsonb), now()) ON CONFLICT (event_id) DO UPDATE SET updated_at = now()",
                    UUID.fromString(String.valueOf(eventId)),
                    idempotencyKey != null ? String.valueOf(idempotencyKey) : null,
                    String.valueOf(type),
                    occurredAt != null ? java.time.OffsetDateTime.parse(String.valueOf(occurredAt)) : null,
                    requestCode != null ? String.valueOf(requestCode) : null,
                    payloadJson
            );
            log.info("[webhook-simrs] diterima {} requestId={} event={}", type, requestCode, eventId);
            return ResponseEntity.ok(Map.of("accepted", true, "eventId", eventId));
        } catch (org.springframework.dao.DataIntegrityViolationException e) {
            // Duplikat — idempotent, anggap OK
            log.info("[webhook-simrs] duplikat eventId={}, abaikan", eventId);
            return ResponseEntity.ok(Map.of("accepted", false, "duplicate", true, "eventId", eventId));
        } catch (Exception e) {
            log.error("[webhook-simrs] gagal simpan", e);
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "gagal simpan event");
        }
    }

    @GetMapping("/simrs/health")
    public Map<String, Object> health() {
        return Map.of(
                "status", "ok",
                "configured", webhookToken != null && !webhookToken.isBlank(),
                "tokenPrefix", webhookToken != null && webhookToken.length() >= 4 ? webhookToken.substring(0, 4) + "***" : "(kosong)"
        );
    }

    private boolean isValidUuid(String s) {
        try {
            UUID.fromString(s);
            return true;
        } catch (IllegalArgumentException e) {
            return false;
        }
    }
}
