package id.nevo.monitoring;

import org.springframework.boot.web.error.ErrorAttributeOptions;
import org.springframework.boot.web.servlet.error.DefaultErrorAttributes;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.WebRequest;

import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Scrubs HTTP error bodies so only curated business messages from our own code reach clients.
 *
 * Konteks: `server.error.include-message: always` membuat pesan bisnis lolos ke body error,
 * tetapi juga membocorkan pesan internal Spring/JDK ("Access Denied", "For input string: ...",
 * "Failed to convert value of type ...", stack hints, dsb). Sanitizer menyaring dengan whitelist:
 * - exact-match   : pesan bisnis tetap dari kode kontrak §7.
 * - prefix        : pesan dinamis yang bagian variabelnya bukan konten sensitif
 *                   (id misi/robot, kode status HTTP, magic number PGM, parameter nama field).
 * - suffix        : `"<field> wajib angka"` (SimulatedRobotService, key bukan konten user).
 * - chained PGM   : `Failed to parse PGM: <X>` hanya lolos bila X adalah pesan konverter
 *                   yang aman (PgmImageConverter); wrapper di MapApi bisa membungkus NFE/NPE,
 *                   jadi pesan mentah TIDAK di-whitelist.
 * - SIMRS retry   : `SIMRS mengembalikan HTTP <code> setelah <n> percobaan` (double-gate
 *                   prefix+suffix) dan `Gagal mengirim status SIMRS: <SimpleClassName>`
 *                   (safeMessage hanya nama kelas exception, isi exception tidak pernah masuk).
 * Semua pesan lain (termasuk null/kosong, 5xx internal) jatuh ke fallback generik
 * `"Permintaan gagal (HTTP <status>)"` — dashboard tetap punya teks yang aman ditampilkan.
 */
@Component
public class ApiErrorSanitizer extends DefaultErrorAttributes {

    private static final String FALLBACK_PREFIX = "Permintaan gagal (HTTP ";
    private static final String FALLBACK_SUFFIX = ")";

    /** Pesan bisnis statis — sama persis dengan sumber di kode. */
    private static final Set<String> EXACT = Set.of(
            // UserApi
            "Body tidak boleh kosong",
            "Password minimal 8 karakter",
            "Username sudah dipakai",
            "Tidak bisa menonaktifkan akun sendiri",
            "Tidak bisa menghapus akun sendiri",
            "Username 3-64 karakter alfanumerik (boleh _ . -)",
            "Nama lengkap 1-150 karakter",
            "Role harus ADMIN, FARMASI, atau OPERATOR",
            "User tidak ditemukan",
            // RobotRegistryApi
            "robotId 3-64 karakter alfanumerik (boleh _ . -)",
            "Nama robot 1-150 karakter",
            "Model maksimal 100 karakter",
            "robotId sudah terdaftar",
            // MissionApi
            "command tidak dikenal",
            "Robot tidak ditemukan",
            "waypointId wajib diisi",
            "Misi tidak ditemukan",
            "SIMRS mapping tidak aktif atau belum dikonfigurasi",
            "limit harus 1..200",
            "missionId dan robotId wajib diisi",
            "Legacy mission lifecycle hanya tersedia pada ROBOT_MODE=sim",
            // MapApi
            "Missing file",
            "Unsupported file extension",
            "YAML exceeds 1MB",
            "Invalid SIMRS mapping schema",
            "Invalid ward",
            "Missing/duplicate room or beds",
            "YAML image filename does not match upload",
            "Missing/invalid resolution or origin",
            "Non-finite origin",
            "Image exceeds 12MB",
            "Invalid PNG header",
            "Corrupted PNG image",
            "Invalid PGM header",
            "Unsupported image type",
            "Map not found",
            "Map has no stored files",
            "Map has no original image",
            "Original image file missing",
            "Waypoint not found",
            "Referenced map does not exist",
            "Invalid waypoint parameters: name required, x/y/yaw must be finite numbers",
            // SimrsClientService
            "Snapshot SIMRS tidak sesuai kontrak",
            "Active deliveries SIMRS tidak sesuai kontrak",
            "requestCode active delivery kosong/duplikat",
            "Mapping SIMRS tidak sesuai kontrak YAML",
            "Ward SIMRS tidak valid",
            "roomCode SIMRS kosong atau duplikat",
            "Mapping SIMRS tidak memiliki ruangan",
            "Konfirmasi serah-terima hanya boleh melalui scan manusia di SIMRS",
            "requestCode dan toStatus kontrak wajib valid",
            "idempotencyKey tidak sesuai kontrak",
            "compartmentNo harus integer >= 0",
            "compartmentNo hanya boleh saat MOCK_ARRIVED_AT_ROOM",
            "SIMRS mapping belum tersedia di cache",
            "SIMRS belum dikonfigurasi; POST ditolak.",
            "Gagal mengirim status SIMRS",
            // SimulatedRobotService
            "compartmentNo harus 0..5 (6 kompartemen tray)",
            "Waypoint tidak ditemukan",
            "Misi tidak aktif atau tidak ditemukan",
            "missionId wajib UUID",
            "waypointId wajib UUID",
            "Robot NEVO-01 sedang menjalankan misi aktif lain",
            "Robot sedang menjalankan misi aktif",
            "speed harus 0..2 m/s",
            "teleop di luar batas",
            // SimrsAdminService
            "patch wajib ada",
            "items wajib ada",
            // PgmImageConverter
            "File too small to be a valid PGM",
            // WebhookSimrsController
            "eventId wajib UUID",
            "type wajib diisi",
            "gagal simpan event");

    /** Pesan dinamis yang aman: variabelnya id/status/format, bukan konten sensitif. */
    private static final List<String> SAFE_PREFIXES = List.of(
            "Misi tidak ditemukan: ",
            "Hanya misi QUEUED yang bisa direassign; status saat ini: ",
            "Robot tidak ditemukan: ",
            "Perintah tidak dikenal: ",
            "ROBOT_MODE=",
            "Unsupported image format: ",
            "Waypoint (",
            "Room code '",
            "Unsupported PGM format: ",
            "Invalid PGM dimensions: ",
            "Unsupported PGM maxVal: ",
            "Gagal mengirim status SIMRS: ");

    /** Akar pesan PgmImageConverter yang aman (dipakai juga untuk gate chained). */
    private static final List<String> PGM_ROOT_PREFIXES = List.of(
            "File too small to be a valid PGM",
            "Unsupported PGM format: ",
            "Invalid PGM dimensions: ",
            "Unsupported PGM maxVal: ");

    private static final String PGM_WRAPPER_PREFIX = "Failed to parse PGM: ";
    private static final String NUMERIC_FIELD_SUFFIX = " wajib angka"; // key = nama field, bukan konten user
    private static final String SIMRS_HTTP_PREFIX = "SIMRS mengembalikan HTTP ";
    private static final String SIMRS_ATTEMPTS_SUFFIX = " percobaan"; // membatasi ke format retry, bukan state mentah

    @Override
    public Map<String, Object> getErrorAttributes(WebRequest request, ErrorAttributeOptions options) {
        Map<String, Object> attrs = super.getErrorAttributes(request, options);
        Integer status = attrs.get("status") instanceof Number n ? n.intValue() : null;
        String raw = attrs.get("message") instanceof String m ? m : null;
        attrs.put("message", sanitize(raw, status));
        return attrs;
    }

    /** Static package-private agar bisa diuji unit tanpa WebRequest (gaya RobotRegistryRestP4Test). */
    static String sanitize(String message, Integer status) {
        if (message != null && isAllowed(message)) return message;
        return FALLBACK_PREFIX + (status == null ? 500 : status) + FALLBACK_SUFFIX;
    }

    static boolean isAllowed(String message) {
        if (message == null || message.isBlank()) return false;
        if (EXACT.contains(message)) return true;
        if (message.endsWith(NUMERIC_FIELD_SUFFIX)) return true;
        if (message.startsWith(SIMRS_HTTP_PREFIX) && message.endsWith(SIMRS_ATTEMPTS_SUFFIX)) return true;
        if (message.startsWith(PGM_WRAPPER_PREFIX)) {
            String wrapped = message.substring(PGM_WRAPPER_PREFIX.length());
            return PGM_ROOT_PREFIXES.stream().anyMatch(wrapped::startsWith);
        }
        return SAFE_PREFIXES.stream().anyMatch(message::startsWith);
    }
}
