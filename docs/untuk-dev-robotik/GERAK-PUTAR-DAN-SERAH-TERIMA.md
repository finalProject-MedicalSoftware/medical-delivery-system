# Untuk dev robotik: gerak putar dan alur serah-terima di tujuan

Dibuat 2026-11-18. Permintaan **kustomisasi** `nevo_robot_api` agar sesuai konsep pengantaran NEVO. Basis analisis: `robot/src/nevo_robot_api/src/robot_api_node.cpp` (handler `OP`, `MOVE`, `handlePickUp`) dan `nevo-dev/nevo_bot/config/controller_mppi_params.yaml` (dipakai `hw_nav.launch.py`).

## 1. Konsep fisik
Tray/kompartemen ada di **belakang** robot, layar HMI di kepala menghadap depan. Di depan pasien robot harus: (1) **menghadap pasien** saat memberi informasi (wajah + aturan pakai + opsional video call dokter), (2) **berputar 180°** agar tray menghadap pasien, (3) menunggu obat diambil, (4) lanjut tugas berikutnya atau pulang ke `home_base`.

## 2. Perilaku robot SAAT INI
- `GOAL_COMPLETE{sequence}` terkirim saat Nav2 sukses, mode → `PAUSED`, lalu **menunggu `PICKUP_CONFIRM` tanpa batas waktu**.
- Tidak ada perintah **putar di tempat**; tidak ada fase/timeout; `PICKUP_CONFIRM` hanya dikirim UI.
- Setelah `PICKUP_CONFIRM`: tray berikutnya (`processNextGoal`) atau pulang ke `home_base` bila antrean habis dan `home_base` diset.

## 3. Parameter gerak yang berlaku (hardware)
| Parameter | Nilai | Sumber |
|---|---|---|
| `wz_max` (kecepatan putar maks) | 0,5 rad/s | `controller_mppi_params.yaml` (FollowPath, MPPI) |
| `vx_max` | 0,25 m/s | idem |
| `yaw_goal_tolerance` | 0,25 rad (≈14°) | idem |
| `wheel_separation` | 0,52 m | `my_sim_controllers.yaml` (cek ulang untuk hardware) |
| `acc_lim_theta` / `decel_lim_theta` (DWB, bila dipakai) | 1,2 / −1,5 rad/s² | `controller_dwb_params.yaml` |

## 4. Perhitungan waktu putar 180°
- Sudut π = 3,1416 rad; pada `wz = 0,5` → **6,3 dtk** kecepatan konstan.
- Akselerasi + deselerasi (±1,2 rad/s²: ±0,4 dtk naik, ±0,3 dtk turun) dan pengecekan tabrakan → **±7–8 dtk**.
- Margin toleransi arah (0,25 rad) dan koreksi akhir → rencanakan **8–10 dtk**; `time_allowance` Spin **15 dtk**.
- Tanpa kecepatan lebih tinggi: menaikkan `wz` hanya untuk fase ini ke 0,8 rad/s memberi ±4–5 dtk, tetapi tidak disarankan di ruang pasien (lansia/anak, tampilan jarak dekat). Biarkan 0,5.

## 5. Garis waktu per tujuan (usulan, semua dapat dikonfigurasi)
| Fase | Durasi rencana | Pemicu keluar |
|---|---|---|
| `ARRIVED` (sampai + wajah "tiba") | 1–2 dtk | otomatis |
| `PRESENTING` (informasi aturan pakai; 3 obat × ±6–8 dtk) | **±20–25 dtk** | HMI mengirim `PRESENT_DONE` atau `present_timeout_s` |
| `IN_CALL` (opsional, video call dokter) | tak terbatas | panggilan berakhir (`CALL_END`) |
| `ROTATING` (putar 180°) | **±8–10 dtk** | Spin selesai atau `time_allowance` |
| `WAITING_PICKUP` | pengingat **60 dtk**, batas keras **120 dtk** | kamera: kompartemen kosong ≥ 2–3 dtk (debounce) **atau** timeout |
| `COLLECTED` / `NOT_COLLECTED` | 2–3 dtk (animasi) | otomatis → tray berikutnya / pulang |
Total per tujuan: normal **±1–1,5 menit**, terlambat **±2–3 menit** (di luar video call). Nilai ini asumsi dan **perlu diukur di robot**.

## 5b. Kebijakan obat tidak diambil (disetujui)
Bila `WAITING_PICKUP` habis dan kamera masih melihat obat: kirim `PICKUP_CONFIRM` dengan `collected:false`, **tandai "tidak diambil"** (backend → SIMRS + pemberitahuan perawat), robot **membawa obat kembali** (lanjut tugas berikutnya lalu pulang ke `home_base`); tidak boleh diam-diam menganggap obat sudah diserahkan.

## 6. Perubahan yang diminta pada robot
1. **Perintah putar di tempat.** Gunakan behavior **Nav2 `Spin`** (`nav2_msgs/action/Spin`, `target_yaw`, `time_allowance`) dari `nav_client_`; hasilnya dilaporkan lewat fase. Gunakan collision checking bawaan (`simulate_ahead_time`). Bila Spin tidak tersedia, cadangan: `MOVE` ke posisi sama dengan `yaw + π`.
2. **State machine fase** di dalam `PAUSED`: `ARRIVED → PRESENTING → (IN_CALL) → ROTATING → WAITING_PICKUP → COLLECTED|NOT_COLLECTED`. Robot **tidak boleh berputar** selama `IN_CALL`.
3. **Uplink fase** baru (untuk HMI/backend): `PHASE {robot_id, ui_id, sequence, phase, expression_hint}` setiap pergantian fase, **termasuk `phase:"IDLE"` saat robot sampai home base** (sekarang robot hanya mengirim `POSITION` lalu IDLE tanpa penanda, sehingga HMI tidak tahu robot sudah siap), `expression_hint` ∈ {`arrived`,`presenting`,`calling`,`turning`,`waiting`,`happy`,`sad`,`stuck`,`low_battery`,`sleep`}. `EXPRESSION` yang sudah ada tetap dipakai untuk kasus khusus.
4. **Downlink baru**: `PRESENT_DONE {sequence}` (dari HMI), `ROTATE {sequence, delta_yaw}` (manual/diagnostik), `CALL_STATE {in_call:true|false}` (HMI → robot saat panggilan mulai/selesai).
5. **`PICKUP_CONFIRM` diperluas**: `{sequence, method:"CAMERA"|"TIMEOUT"|"MANUAL", collected:true|false}`. Robot sendiri yang mengirim ke dirinya (dari modul kamera) atau diteruskan ke uplink; wajib ada `collected`.
6. **Parameter** (launch/YAML, bukan hardcode): `present_timeout_s` (45), `rotate_wz` (0,5), `rotate_time_allowance_s` (15), `pickup_reminder_s` (60), `pickup_timeout_s` (120), `pickup_debounce_s` (2,5), `safety_clearance_m` (jarak aman saat berputar).
7. **Keselamatan putar**: bila lidar mendeteksi objek/orang di dalam `safety_clearance_m` dari sisi/belakang robot, tunda `ROTATING` dan bunyikan `EXPRESSION` "perhatian"; jangan memaksa berputar.
8. **Tidur**: tanpa tugas 15 menit → fase `sleep` (HMI) — HMI bisa memicu sendiri dari `READY`/tidak ada `OP`; robot cukup melaporkan `idle_since`.

## 7. Dampak ke backend/HMI (informasi)
Backend sudah menerima `GOAL_COMPLETE` (→ SIMRS `ARRIVED_AT_ROOM`). Akan ditambah: `PHASE` (untuk log misi) dan `PICKUP_CONFIRM{collected:false}` → status SIMRS baru `NOT_COLLECTED` + notifikasi perawat. Serah-terima SIMRS tetap oleh **manusia** (scan QR); `COLLECTED` dari kamera hanya melepas robot, bukan menggantikan konfirmasi SIMRS.

## 8. Uji penerimaan
Putar 180° di ruang 3×3 m tanpa tabrakan; 10× berturut-turut selesai ≤ 10 dtk; berhenti saat ada orang <`safety_clearance_m`; `PICKUP_CONFIRM` timeout tepat di `pickup_timeout_s` ±1 dtk; tiga tujuan beruntun; kehilangan Wi-Fi saat `WAITING_PICKUP` tidak menghentikan siklus (jalur lokal).
