package id.nevo.monitoring;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Unit test ApiErrorSanitizer: pesan bisnis lolos, pesan internal Spring/JDK >= fallback generik. */
class ApiErrorSanitizerTest {

    // ---------- isAllowed: whitelist ----------

    @Test
    void exactBusinessMessagesAreAllowed() {
        assertTrue(ApiErrorSanitizer.isAllowed("robotId sudah terdaftar"));
        assertTrue(ApiErrorSanitizer.isAllowed("Password minimal 8 karakter"));
        assertTrue(ApiErrorSanitizer.isAllowed("command tidak dikenal"));
        assertTrue(ApiErrorSanitizer.isAllowed("Map not found"));
        assertTrue(ApiErrorSanitizer.isAllowed("SIMRS belum dikonfigurasi; POST ditolak."));
        assertTrue(ApiErrorSanitizer.isAllowed("gagal simpan event"));
        assertTrue(ApiErrorSanitizer.isAllowed("File too small to be a valid PGM"));
    }

    @Test
    void safeDynamicPrefixesAreAllowed() {
        assertTrue(ApiErrorSanitizer.isAllowed("Misi tidak ditemukan: M-123"));
        assertTrue(ApiErrorSanitizer.isAllowed(
                "Hanya misi QUEUED yang bisa direassign; status saat ini: EXECUTING"));
        assertTrue(ApiErrorSanitizer.isAllowed("Robot tidak ditemukan: NEVO-02"));
        assertTrue(ApiErrorSanitizer.isAllowed("Perintah tidak dikenal: 99"));
        assertTrue(ApiErrorSanitizer.isAllowed("ROBOT_MODE=real belum memiliki adapter operasional"));
        assertTrue(ApiErrorSanitizer.isAllowed("Unsupported image format: map.png"));
        assertTrue(ApiErrorSanitizer.isAllowed("Waypoint (9.99, 0.00) is out of map bounds [10x10, res=0.050, origin=(0.00, 0.00)]"));
        assertTrue(ApiErrorSanitizer.isAllowed("Room code 'R-01' is already assigned to another waypoint on this map"));
        assertTrue(ApiErrorSanitizer.isAllowed("Unsupported PGM format: P77. Only P5 (binary) and P2 (ascii) are supported."));
        assertTrue(ApiErrorSanitizer.isAllowed("Invalid PGM dimensions: 0x999"));
        assertTrue(ApiErrorSanitizer.isAllowed("Unsupported PGM maxVal: 700 (only <= 255 supported)"));
    }

    @Test
    void numericFieldSuffixIsAllowed() {
        assertTrue(ApiErrorSanitizer.isAllowed("speed wajib angka"));
        // key = identifier program, bukan konten user
        assertTrue(ApiErrorSanitizer.isAllowed("teleop wajib angka"));
    }

    @Test
    void simrsRetryMessageIsAllowedViaDoubleGate() {
        assertTrue(ApiErrorSanitizer.isAllowed("SIMRS mengembalikan HTTP 500 setelah 5 percobaan"));
        assertTrue(ApiErrorSanitizer.isAllowed("SIMRS mengembalikan HTTP 503 setelah 3 percobaan"));
        // Pola state mentah tanpa suffix " percobaan" TIDAK lolos
        assertFalse(ApiErrorSanitizer.isAllowed("SIMRS mengembalikan HTTP 500"));
    }

    @Test
    void simrsSafeMessageVariantIsAllowed() {
        // safeMessage hanya memuat SimpleClassName exception
        assertTrue(ApiErrorSanitizer.isAllowed("Gagal mengirim status SIMRS: SocketException"));
        assertTrue(ApiErrorSanitizer.isAllowed("Gagal mengirim status SIMRS: IOException"));
    }

    @Test
    void pgmWrapperIsChainedGated() {
        // Wrapper di MapApi mengarah ke pesan konverter aman -> lolos
        assertTrue(ApiErrorSanitizer.isAllowed("Failed to parse PGM: File too small to be a valid PGM"));
        assertTrue(ApiErrorSanitizer.isAllowed("Failed to parse PGM: Unsupported PGM format: ZZ. Only P5 (binary) and P2 (ascii) are supported."));
        // Tapi jika membungkus exception JDK mentah (NFE/NPE) -> TIDAK lolos
        assertFalse(ApiErrorSanitizer.isAllowed("Failed to parse PGM: For input string: \"abc\""));
        assertFalse(ApiErrorSanitizer.isAllowed("Failed to parse PGM: null"));
    }

    // ---------- isAllowed: pesan Spring/JDK mentah ditolak ----------

    @Test
    void springAndJdkInternalMessagesAreDenied() {
        assertFalse(ApiErrorSanitizer.isAllowed("Access Denied"));
        assertFalse(ApiErrorSanitizer.isAllowed("For input string: \"abc\""));
        assertFalse(ApiErrorSanitizer.isAllowed(null));
        assertFalse(ApiErrorSanitizer.isAllowed("No static resource error."));
        assertFalse(ApiErrorSanitizer.isAllowed(
                "Failed to convert value of type 'java.lang.String' to required type 'java.lang.Long'"));
        assertFalse(ApiErrorSanitizer.isAllowed("Validation failed for argument [0]"));
        assertFalse(ApiErrorSanitizer.isAllowed("Failed to convert PGM to PNG: NullPointerException"));
        assertFalse(ApiErrorSanitizer.isAllowed("numberFormatException"));
        assertFalse(ApiErrorSanitizer.isAllowed(""));
    }

    // ---------- sanitize: fallback generik ----------

    @Test
    void deniedMessagesFallBackToGenericText() {
        assertEquals("Permintaan gagal (HTTP 403)",
                ApiErrorSanitizer.sanitize("Access Denied", 403));
        assertEquals("Permintaan gagal (HTTP 400)",
                ApiErrorSanitizer.sanitize("For input string: \"xyz\"", 400));
    }

    @Test
    void nullOrBlankMessagesFallBackToGenericText() {
        assertEquals("Permintaan gagal (HTTP 500)", ApiErrorSanitizer.sanitize(null, 500));
        assertEquals("Permintaan gagal (HTTP 400)", ApiErrorSanitizer.sanitize("", 400));
        assertEquals("Permintaan gagal (HTTP 400)", ApiErrorSanitizer.sanitize("   ", 400));
    }

    @Test
    void defaultStatusIs500WhenUnknown() {
        assertEquals("Permintaan gagal (HTTP 500)", ApiErrorSanitizer.sanitize("Access Denied", null));
    }

    @Test
    void businessMessagesPassThroughUnchanged() {
        int status = 409;
        assertEquals("robotId sudah terdaftar",
                ApiErrorSanitizer.sanitize("robotId sudah terdaftar", status));
    }

    @Test
    void messageIsCaseExact() {
        assertFalse(ApiErrorSanitizer.isAllowed("Robot status ditemukan: NEVO-01"));
        assertFalse(ApiErrorSanitizer.isAllowed("misi tidak ditemukan: M-1"));
        assertFalse(ApiErrorSanitizer.isAllowed("Body Tidak Boleh Kosong"));
    }
}
