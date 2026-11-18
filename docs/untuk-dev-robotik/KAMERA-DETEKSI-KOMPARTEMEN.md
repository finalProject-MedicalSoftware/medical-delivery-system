# Untuk dev robotik: kamera deteksi obat di kompartemen (PICKUP_CONFIRM otomatis)

Dibuat 2026-11-18. Tujuan: robot mengetahui **obat sudah diambil** dari kompartemen tugas tanpa menyentuh layar/tombol (sterilisasi). Satu kamera melihat **semua** kompartemen (disetujui). Program kamera dikerjakan dev robotik pada paket baru (usulan nama `nevo_vision`).

## 1. Keluaran yang dibutuhkan
Topik ROS 2 (usulan) `nevo/compartment_state` (`std_msgs/String` berisi JSON, atau pesan khusus di `nevo_msgs`), 2–5 Hz:
```json
{ "robot_id": "TFRB5", "stamp": "2026-11-18T10:00:00.000Z", "camera_ok": true,
  "compartments": [ {"index": 0, "occupied": true, "confidence": 0.93},
                    {"index": 1, "occupied": false, "confidence": 0.88} ] }
```
`index` = nomor kompartemen yang sama dengan `tray` pada `OP.tray_tasks[]` dan `t_delivery_compartment.compartment_no` (0-based; jumlah dari `nevo.robot.compartment-count`, default 6).

## 2. Cara robot memakainya
- Saat fase `WAITING_PICKUP` untuk `tray = k`: bila `compartments[k].occupied == false` **terus-menerus ≥ `pickup_debounce_s` (2–3 dtk)** → kirim `PICKUP_CONFIRM {sequence, method:"CAMERA", collected:true}`.
- Bila `pickup_timeout_s` habis dan masih `occupied == true` → `collected:false`, `method:"TIMEOUT"`.
- Bila `camera_ok == false` atau `confidence` rendah → **jangan** menyimpulkan "kosong"; jatuh ke timeout, dan laporkan `ERROR`/`camera_fault` agar perawat tahu.
- Kompartemen yang bukan tugas saat ini diabaikan (pasien lain di manifest yang sama).

## 3. Persyaratan deteksi
- **Kalibrasi/baseline**: saat pemuatan (sebelum dispatch) ambil gambar rujukan per kompartemen dalam keadaan **terisi**; ROI per kompartemen di YAML (jangan hardcode). Deteksi = perubahan terhadap baseline atau kompartemen kosong (model sederhana: selisih citra + ambang, atau klasifier kecil "ada/tidak ada obat").
- Tahan terhadap: perubahan cahaya kamar, bayangan tangan pasien, obat kecil (strip/botol/ampul), gerakan robot saat berputar.
- **Debounce**: tangan di atas kompartemen ≠ kosong; kosong baru sah setelah tangan keluar dan keadaan stabil.
- Beban komputasi ringan (komputer robot, tanpa GPU bila memungkinkan); target ≤ 200 ms/frame.
- **Privasi**: kamera ini hanya melihat tray; **tidak merekam/menyimpan** gambar; bila memotret wajah secara tak sengaja, buang (tidak dikirim keluar robot).

## 4. Konfigurasi (YAML/launch)
`camera_device`, `roi_file`, `compartment_count`, `empty_threshold`, `confidence_min`, `publish_hz`, `pickup_debounce_s`, `calibration_on_load` (true/false).

## 5. Pemisahan kamera
Kamera depan **tablet** (HMI) untuk wajah/kehadiran/video call dan kamera **tray** ini **terpisah**; jangan berbagi proses. Modul deteksi wajah/isyarat untuk HMI dikerjakan di sisi HMI (lihat `docs/hmi/DESAIN-HMI.md`).

## 6. Uji penerimaan
Ambil 1 dari 3 obat → hanya kompartemen itu `occupied:false`; tangan melintas tanpa mengambil → tidak terkonfirmasi; kamera ditutup → `camera_ok:false` dan timeout berjalan; 20 percobaan ambil/letak dengan ≥95% benar; pencahayaan redup/terang.
