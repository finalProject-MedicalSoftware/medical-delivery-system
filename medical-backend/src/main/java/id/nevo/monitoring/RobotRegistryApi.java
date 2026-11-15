package id.nevo.monitoring;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.net.InetAddress;
import java.util.*;

@RestController
@RequestMapping("/api/v1/robots")
public class RobotRegistryApi {
    private final JdbcTemplate jdbc;
    private final RobotAdapter adapter;
    private static final String FIELDS = "robot_id,name,model,device_code,host(internal_ip) AS internal_ip,ssid,registration_status,registered_at,updated_at";
    @Autowired
    public RobotRegistryApi(JdbcTemplate jdbc, RobotAdapter adapter) { this.jdbc = jdbc; this.adapter = adapter; }
    RobotRegistryApi(JdbcTemplate jdbc) { this(jdbc, null); }

    @GetMapping("/registry")
    public List<Map<String,Object>> registry(Authentication auth) {
        Map<String,String> online = connections();
        List<Map<String,Object>> result = new ArrayList<>();
        for (Map<String,Object> row : jdbc.queryForList("SELECT " + FIELDS + " FROM m_robot ORDER BY robot_id"))
            result.add(view(row, auth, online));
        return result;
    }
    List<Map<String,Object>> registry() {
        return registry(new UsernamePasswordAuthenticationToken("legacy", ""));
    }
    @GetMapping("/{robotId}")
    public Map<String,Object> detail(@PathVariable String robotId, Authentication auth) {
        return view(find(robotId), auth, connections());
    }
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public Map<String,Object> register(@RequestBody RobotReq req, Authentication auth) {
        if (req == null) throw bad("Body tidak boleh kosong");
        String id = opt(req.robotId());
        if (id == null) id = "NEVO-" + UUID.randomUUID();
        if (!id.matches("[A-Za-z0-9_.-]{3,64}")) throw bad("Robot ID harus 3-64 karakter aman");
        String name = name(req.name()), model = model(req.model()), code = code(req.deviceCode());
        String ip = ip(req.internalIp()), ssid = ssid(req.ssid());
        if (exists("robot_id", id)) throw conflict("Robot ID sudah terdaftar");
        if (code != null && exists("device_code", code)) throw conflict("Device Code sudah terdaftar");
        try {
            jdbc.update("INSERT INTO m_robot(robot_id,name,model,device_code,internal_ip,ssid,registration_status) VALUES (?,?,COALESCE(?,'NEVO-A1'),?,?::inet,?,?)",
                id,name,model,code,ip,ssid,code == null ? "DRAFT" : "PENDING_VERIFICATION");
        } catch (DataIntegrityViolationException e) { throw conflict("Robot ID atau Device Code sudah terdaftar"); }
        audit(auth,"ROBOT_REGISTER");
        return view(find(id),auth,Map.of());
    }
    @PutMapping("/{robotId}")
    @Transactional
    public Map<String,Object> update(@PathVariable String robotId, @RequestBody RobotReq req, Authentication auth) {
        Map<String,Object> old = find(robotId);
        if (req == null) throw bad("Body tidak boleh kosong");
        if (req.robotId() != null && !robotId.equals(req.robotId())) throw bad("Robot ID tidak dapat diubah");
        String prior = (String)old.get("registration_status");
        if ("ARCHIVED".equals(prior)) throw conflict("Robot sudah diarsipkan");
        String name = name(req.name()), model = model(req.model()), code = code(req.deviceCode());
        String ip = ip(req.internalIp()), ssid = ssid(req.ssid());
        String previous = (String)old.get("device_code");
        if (code != null && !code.equals(previous) && exists("device_code",code)) throw conflict("Device Code sudah terdaftar");
        String status = "DISABLED".equals(prior) ? prior : Objects.equals(code,previous) ? prior :
            code == null ? "DRAFT" : "PENDING_VERIFICATION";
        try {
            jdbc.update("UPDATE m_robot SET name=?,model=COALESCE(?,'NEVO-A1'),device_code=?,internal_ip=?::inet,ssid=?,registration_status=?,updated_at=now() WHERE robot_id=?",
                name,model,code,ip,ssid,status,robotId);
        } catch (DataIntegrityViolationException e) { throw conflict("Device Code sudah terdaftar"); }
        audit(auth,"ROBOT_UPDATE");
        return view(find(robotId),auth,connections());
    }
    @PostMapping("/{robotId}/disable")
    @Transactional
    public Map<String,Object> disable(@PathVariable String robotId, Authentication auth) {
        String status = (String)find(robotId).get("registration_status");
        if ("ARCHIVED".equals(status)) throw conflict("Robot sudah diarsipkan");
        if (!"DISABLED".equals(status)) {
            requireInactive(robotId);
            jdbc.update("UPDATE m_robot SET registration_status='DISABLED',disabled_at=now(),updated_at=now() WHERE robot_id=?",robotId);
            audit(auth,"ROBOT_DISABLE");
        }
        return view(find(robotId),auth,connections());
    }
    @PostMapping("/{robotId}/archive")
    @Transactional
    public Map<String,Object> archive(@PathVariable String robotId, Authentication auth) {
        if (!"DISABLED".equals(find(robotId).get("registration_status"))) throw conflict("Nonaktifkan robot sebelum arsip");
        requireInactive(robotId);
        jdbc.update("UPDATE m_robot SET registration_status='ARCHIVED',updated_at=now() WHERE robot_id=?",robotId);
        audit(auth,"ROBOT_ARCHIVE");
        return view(find(robotId),auth,connections());
    }
    private void requireInactive(String id) {
        if (adapter instanceof RealRobotAdapter) {
            String connection = connections().get(id);
            if (connection == null) throw conflict("Status koneksi robot belum dapat dipastikan");
            if ("ONLINE".equals(connection)) throw conflict("Robot masih terhubung");
        }
        Integer active = jdbc.queryForObject("SELECT count(*) FROM t_mission WHERE robot_id=? AND status::text IN ('SUBMITTED','BACKEND_ACCEPTED','ROBOT_ACKNOWLEDGED','EXECUTING','QUEUED')",Integer.class,id);
        if (active != null && active > 0) throw conflict("Robot masih mempunyai misi aktif");
    }
    private Map<String,String> connections() {
        if (!(adapter instanceof RealRobotAdapter)) return Map.of();
        Map<String,String> result = new HashMap<>();
        try {
            for (Map<String,Object> robot : adapter.getRobots())
                result.put((String)robot.get("robotId"),(String)robot.get("connectionStatus"));
        } catch (RuntimeException ignored) { }
        return result;
    }
    private Map<String,Object> find(String id) {
        List<Map<String,Object>> rows = jdbc.queryForList("SELECT " + FIELDS + " FROM m_robot WHERE robot_id=?",id);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Robot tidak ditemukan");
        return rows.get(0);
    }
    private Map<String,Object> view(Map<String,Object> row, Authentication auth, Map<String,String> connections) {
        Map<String,Object> out = new LinkedHashMap<>();
        String id = (String)row.get("robot_id");
        out.put("robotId",id); out.put("name",row.get("name")); out.put("model",row.get("model"));
        if (auth.getAuthorities().stream().anyMatch(a -> a.getAuthority().equals("ROLE_ADMIN"))) out.put("deviceCode",row.get("device_code"));
        out.put("internalIp",row.get("internal_ip")); out.put("ssid",row.get("ssid"));
        out.put("registrationStatus",row.get("registration_status"));
        out.put("connectionStatus",connections.getOrDefault(id,"UNKNOWN"));
        out.put("registeredAt",row.get("registered_at") == null ? null : row.get("registered_at").toString());
        out.put("updatedAt",row.get("updated_at") == null ? null : row.get("updated_at").toString());
        return out;
    }
    private boolean exists(String column,String value) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM m_robot WHERE " + column + "=?)",Boolean.class,value));
    }
    private static String opt(String v) { return v == null || v.trim().isEmpty() ? null : v.trim(); }
    private static String name(String v) { String s=opt(v); if(s==null || s.length()>150) throw bad("Nama robot harus 1-150 karakter"); return s; }
    private static String model(String v) { String s=opt(v); if(s!=null && s.length()>100) throw bad("Model maksimal 100 karakter"); return s; }
    private static String code(String v) { String s=opt(v); if(s!=null && !s.matches("[A-Za-z0-9_.:-]{1,128}")) throw bad("Device Code harus 1-128 karakter aman tanpa spasi"); return s; }
    private static String ssid(String v) { String s=opt(v); if(s!=null && s.length()>255) throw bad("SSID maksimal 255 karakter"); return s; }
    private static String ip(String v) {
        String s=opt(v); if(s==null) return null;
        if(!s.matches("[0-9A-Fa-f:.]{2,45}")) throw bad("Internal IP tidak valid");
        try { InetAddress.getByName(s); } catch(Exception e) { throw bad("Internal IP tidak valid"); }
        return s;
    }
    private static ResponseStatusException bad(String s) { return new ResponseStatusException(HttpStatus.BAD_REQUEST,s); }
    private static ResponseStatusException conflict(String s) { return new ResponseStatusException(HttpStatus.CONFLICT,s); }
    private void audit(Authentication auth,String op) {
        jdbc.update("INSERT INTO h_mapping_audit(actor,operation,mapping_id) VALUES (?,?,?)",auth.getName(),op,null);
    }
    public record RobotReq(String robotId,String name,String model,String deviceCode,String internalIp,String ssid) {
        public RobotReq(String robotId,String name,String model) { this(robotId,name,model,null,null,null); }
    }
}
