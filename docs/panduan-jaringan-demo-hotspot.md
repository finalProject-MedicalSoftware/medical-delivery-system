# Jaringan untuk demo/pameran (hotspot) — apakah aman?

Jawaban singkat: **aman dan cukup, dengan syarat di bawah.** Semua komponen (SIMRS, backend, gateway, dashboard, robot, tablet, laptop dokter) berbicara di jaringan lokal; internet tidak dibutuhkan.

## Syarat
1. **Bawa jaringan sendiri**, bukan Wi-Fi gedung pameran. Wi-Fi publik sering memakai *client isolation* (perangkat tak bisa saling bicara) dan memblokir port/WebRTC. Hotspot ponsel atau router travel (mis. GL.iNet) pribadi lebih andal; **router travel lebih baik** (DHCP stabil, bisa reservasi IP).
2. **WPA2/WPA3 + kata sandi kuat**, tidak dibagikan. Robot terhubung ke gateway **tanpa token** (identitas fisik belum terautentikasi) dan, saat `ALLOW_ROBOT_MOTION=true`, siapa pun di jaringan yang sama bisa mengaku sebagai robot atau menggerakkannya. Jaringan tertutup = perlindungan utama.
3. **`ALLOW_ROBOT_MOTION=true` hanya saat demo** dan robot diawasi; matikan setelahnya. Biarkan `MEDICAL_WS_BIND=0.0.0.0` hanya selama demo.
4. **IP berubah**: ponsel/router bisa memberi IP baru. Catat IP laptop host (`ipconfig getifaddr en0`) dan perbarui `ws_uri_primary` di robot dan alamat gateway di HMI. Lebih baik reservasi IP (router) atau pakai nama host.
5. **Wi-Fi tanpa internet**: ponsel/tablet kadang pindah otomatis ke data seluler. Matikan data seluler di tablet dan perangkat dokter, atau aktifkan "tetap terhubung Wi-Fi".
6. **Kuota**: tidak ada trafik internet; video call antar perangkat lokal tidak memakai kuota seluler.

## Ketahanan (rancangan hibrida)
Jalur **lokal** (HMI ↔ robot, WS 8765 via ADB) menjaga wajah, aturan pakai, dan konfirmasi pengambilan tetap jalan walau Wi-Fi putus. Yang tergantung Wi-Fi hanya: status ke web/SIMRS dan video call dokter. Siapkan skenario cadangan: bila Wi-Fi putus, demo wajah + serah-terima lokal tetap bisa diperagakan.

## Daftar cek sebelum tampil
- [ ] Semua perangkat di SSID yang sama; ping laptop host dari robot dan tablet
- [ ] `docker compose ps` semua sehat; gateway terbuka ke LAN (`MEDICAL_WS_BIND=0.0.0.0`)
- [ ] Robot muncul online di `/robots`; HMI terhubung
- [ ] Browser dokter di `http://localhost:3100` (laptop host) atau HTTPS (lihat `untuk-rekan/HTTPS-DAN-VIDEO-CALL-DOKTER.md`)
- [ ] Baterai robot dan tablet; kabel ADB cadangan
