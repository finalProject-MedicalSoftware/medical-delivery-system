# Referensi kode robot NEVO & program TIFA (setelah folder lokal dihapus)

Dibuat 2026-11-23. Folder `programTIFA/` (sekitar 1,2 GB) dan `robot/` (sekitar 100 MB) dihapus dari laptop untuk menghemat ruang.
Isinya tetap bisa dipulihkan. Dokumen di repo ini masih merujuk ke path di bawah, jadi gunakan tabel ini untuk mengambilnya kembali.

## Cara memulihkan

Di laptop ini file `robot/` dan `programTIFA/*` ditandai `skip-worktree`. Penghapusan lokal tidak muncul di `git status` dan tidak akan ikut ter-commit, jadi repo tim tetap utuh.
Sebelum memulihkan dari git, buka dulu tandanya:
`git ls-files -v | grep '^S' | cut -c3- | xargs git update-index --no-skip-worktree`

| Folder | Sumber | Perintah |
|---|---|---|
| `robot/` (ROS 2 NEVO) | ter-track di repo ini | `git checkout HEAD -- robot` |
| `programTIFA/tifa_robot_api` | ter-track di repo ini | `git checkout HEAD -- programTIFA/tifa_robot_api` |
| `programTIFA/tifa-app` | `git@github.com:forgixrobotic/tifa-app.git` (master `f21936e`) | `git clone … programTIFA/tifa-app` |
| `programTIFA/tifa-be` | `git@github.com:forgixrobotic/tifa-be.git` (branch `fix/robot-map-upload-403-500`, `4fb8dd2`) | clone, lalu checkout branch itu |
| `programTIFA/tifa-web` | `git@github.com:forgixrobotic/tifa-web.git` (main, `661a6e5` belum di-push) | clone, lalu `git pull <arsip>/tifa-web-belum-push.bundle HEAD` |
| `programTIFA/tifa-ws` | `git@github.com:forgixrobotic/tifa-ws.git` (master `e74af83`) | `git clone …` |

Pekerjaan yang hanya ada di laptop sudah diarsipkan di `~/Documents/Dokumen - MacBook Pro rayyy/arsip-programTIFA-2026-11-23/`:
- `tifa-web-belum-push.bundle`: commit `661a6e5` "fix: wait robot MAPPING_SAVE ACK before MAPPING_STOP". Bundle butuh `70f254d` yang sudah ada di GitHub.
- `tifa-web-uncommitted.patch` dan `tifa-web-db/`: perubahan `app/api/robot-control/route.ts` dan folder `db/` yang belum ter-track.
- `tifa-be-uncommitted.patch`: perubahan `Goal.java`, `GoalCategory.java`, `GoalCategoryRepository.java`, `MapUploadService.java`.
- `commit-terakhir.txt`: remote, branch, dan hash tiap repo saat dihapus.

Terapkan patch dengan `git apply <file>.patch` di repo hasil clone.

## Peta isi `robot/src` (ROS 2 Humble, migrasi ke Jazzy)

| Package | Isi / peran | Dirujuk oleh |
|---|---|---|
| `nevo_robot_api` | `robot_api_node.cpp` (handler frame WS robot), `state_machine.cpp`, `slam_supervisor_node.cpp`, `sensor_manager_node.cpp`, `position_sensor_node.cpp` | `docs/untuk-dev-robotik/GERAK-PUTAR-DAN-SERAH-TERIMA.md` |
| `nevo_ws_bridge` | Jembatan WebSocket lokal robot, port **8765** (HMI lewat ADB reverse; frame `{code,data}` tanpa handshake) | `medical-hmi/src/link/robotLink.ts`, `docs/hmi/DESAIN-HMI.md` |
| `nevo_diagnostic_node` | Pengamat pasif boot (INIT → CHECKING → READY/FAILED), menerbitkan JSON ke `/nevo/ws_out`. `checks[]` dari `systemctl is-active`, konfigurasi di `config/diagnostic_params.yaml` | `docs/hmi/HANDOFF-CLAUDE-CODE.md` |
| `nevo-dev/nevo_bot` (sekitar 97 MB) | Navigasi tingkat tinggi: `slam_toolbox`, `m_explore_lite`, Nav2 (AMCL, MPPI, A*), STVL 3D, `twist_mux` | – |
| `nevo-dev/{rplidar_ros, m-explore-ros2, rf2o_laser_odometry, kinect_ros2}` | Driver lidar, eksplorasi, odometri laser, Kinect | – |
| `diffdrive_arduino`, `serial` | Antarmuka `ros_control` ke Arduino, pustaka serial | – |
| `nevo_gsheet_logger(_v2)` | Logging uji navigasi ke Google Sheets (credentials **tidak** di-commit) | – |
| `nevo_msgs`, `runtime/` | Pesan kustom; skrip, konfigurasi, sudoers, dan sysctl runtime robot | – |

### Kode frame WS yang dikenali `nevo_robot_api` / `nevo_ws_bridge` (dari kode, 2026-11-23)
`READY`, `POSITION`, `EXPRESSION`, `GOAL_ACCEPTED`, `GOAL_COMPLETE`, `MOVE`, `MOVING`, `PAUSED`, `RESUMED`, `INTERRUPT`,
`INTERRUPT_CONFIRM`, `INTERRUPT_CANCEL`, `PICKUP_CONFIRM`, `RETURNING_HOME`, `HOME_BASE`, `ROBOT_STUCK`, `OBSTACLE_DETECTED`, `NAV_ABORTED`,
`TELEOP`, `MODE`, `MAPPING_START`, `MAPPING_STOP`, `MAPPING_SAVE`, `MAPPING_STATUS`, `MAPPING_FLAG`, `MAPPING_DONE`, `MAP_DATA`, `MAP_SELECTED`,
`MAP_BUSY`, `MAP_ERROR`, `MAP_LOAD_FAILED`, `QUEUE_FULL`, `INVALID_SEQUENCE`, `DUPLICATE_ROBOT_ID`, `BATTERY`, `CHARGING`, `MOTOR_FAIL`, `ERROR`.
Kontrak resminya tetap di `docs/api-contracts/robot-ws-tifa.md` dan `docs/api-contracts/hmi.md`. Daftar ini hanya catatan dari kode.

## Peta `programTIFA` (sistem TIFA, pola acuan arsitektur proyek ini)

| Repo | Peran | Rujukan penting |
|---|---|---|
| `tifa-web` | Next.js dashboard TIFA (acuan `medical-dashboard-monitoring`) | `lib/wsClient.ts` = handler pesan WS robot inbound (`docs/api-contracts/robot-flag-ack-web-revisi.md`); `app/api/robot-control/route.ts` |
| `tifa-be` | Spring Boot backend TIFA (acuan `medical-backend`): Goal, GoalCategory, MapUploadService | analisis di `docs/findings-analisis-tifa.md` |
| `tifa-ws` | Gateway WebSocket TIFA (acuan `medical-ws`) | – |
| `tifa-app` | Aplikasi TIFA (acuan pola HMI / React Native) | `docs/api-contracts/hmi.md` |
| `tifa_robot_api` | API robot C++ (CMake) + diagram arsitektur | – |

Dokumen yang masih menyebut path ini: `simrs-dummy/docs/ANALISIS-INTEGRASI-ROBOT.md`, `docs/untuk-dev-robotik/GERAK-PUTAR-DAN-SERAH-TERIMA.md`,
`docs/hmi/DESAIN-HMI.md`, `docs/hmi/HANDOFF-CLAUDE-CODE.md`, `docs/api-contracts/robot-flag-ack-web-revisi.md`. Pulihkan dengan perintah di atas bila perlu membaca kodenya.

## Perubahan yang hilang saat penghapusan (2026-11-23), wajib dikerjakan ulang

Saat `robot/` dihapus, perubahan **belum di-commit** dari sesi Claude Desktop pada `robot/src/nevo_diagnostic_node/` ikut hilang.
Lihat `docs/hmi/HANDOFF-CLAUDE-CODE.md`, tabel §1 baris "Robot" dan T5.
Tidak ada salinan di snapshot APFS, Time Machine, log sesi Claude, maupun disk VM Claude Desktop.
Package itu sudah dipulihkan ke versi commit `0143a36`, tanpa perubahan tersebut.

Spesifikasi untuk dibuat ulang, diambil dari konsumen yang masih utuh (`medical-hmi/src/states/machine.ts` `parseInit`, `src/status/RobotStatus.tsx`) dan dari handoff:
- Frame `INIT` ke `/nevo/ws_out` membawa:
  - `status`: `INITIALIZING`, `READY`, atau `FAILED`;
  - `init_message`, `mode` (string), `elapsed_sec`, `timeout_sec` (angka);
  - `checks[]`: `{ id, label, state, required }`.
- `state` tiap check: `OK`, `ACTIVE`, `WAIT`, `INACTIVE`, `SKIP`, atau `FAIL`/`FAILED`.
  Untuk service, isinya dari `systemctl is-active <service>`: aktif menjadi `ACTIVE`, mati menjadi `INACTIVE`.
- Parameter `require_service` di `config/diagnostic_params.yaml`: bila `true`, service navigasi yang mati membuat status `FAILED`.
- Uji (T5): `colcon build --packages-select nevo_diagnostic_node`, lalu `ros2 topic echo /nevo/ws_out`, lalu `systemctl stop <nav_service>`. Status harus `INACTIVE`, atau `FAILED` bila `require_service: true`.
