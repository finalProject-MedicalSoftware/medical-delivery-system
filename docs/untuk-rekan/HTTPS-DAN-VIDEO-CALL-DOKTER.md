# Untuk rekan (web monitoring): HTTPS dan video call dokter → robot

Status: **permintaan implementasi**. Dibuat 2026-11-18 dari brainstorming HMI. Konteks: dokter memanggil robot dari web monitoring; robot menampilkan wajah dokter di tablet kepala dan pasien tampil di web (video 2 arah, kamera + mikrofon).

## 1. Kenapa HTTPS wajib
Browser hanya mengizinkan `getUserMedia` (kamera/mikrofon) pada **secure context**: `https://...` atau `http://localhost`. Dashboard sekarang `http://<IP>:3100`, sehingga tombol "Panggil robot" tidak akan bisa mengakses kamera dokter bila dibuka dari laptop lain.

Pilihan (urut dari termudah):
| Pilihan | Cara | Cocok untuk |
|---|---|---|
| **A. Browser dokter di mesin yang sama dengan Docker** | buka `http://localhost:3100` — `localhost` dianggap secure context. | demo cepat/pameran (satu laptop host + dokter) |
| **B. HTTPS lokal dengan mkcert** | `mkcert -install && mkcert <IP-LAN> localhost`; pasang sertifikat di reverse proxy (Caddy/nginx) di depan `dashboard:3000`. Laptop dokter lain harus mempercayai CA mkcert (impor `rootCA.pem`). | uji multi-perangkat di LAN |
| **C. Caddy dengan `tls internal`** | `caddy reverse-proxy --from https://<IP-LAN> --to dashboard:3000` (CA internal Caddy; impor root CA ke perangkat dokter). | LAN tetap |
| **D. Domain + Let's Encrypt** | domain nyata + sertifikat valid. | produksi RS |

Catatan teknis: cookie sesi dan CSRF backend harus tetap bekerja di belakang proxy (`Secure` cookie aman pada HTTPS); WebSocket relay BFF (`/api/ws/stream` SSE) tetap lewat proxy yang sama (matikan buffering SSE: `X-Accel-Buffering: no` sudah dikirim).

## 2. Signaling lewat gateway `medical-ws`
Media (audio+video) **peer-to-peer WebRTC**; gateway hanya membawa pesan sinyal. Usulan frame baru (bentuk `{code,data}` seperti protokol robot lain):

| Arah | `code` | `data` |
|---|---|---|
| web → HMI | `CALL_REQUEST` | `{robot_id, call_id (uuid), from:{role:"DOCTOR",name}, reason?}` |
| HMI → web | `CALL_ACCEPT` / `CALL_DECLINE` | `{robot_id, call_id, reason?}` |
| dua arah | `CALL_SIGNAL` | `{robot_id, call_id, kind:"offer"\|"answer"\|"ice", payload}` |
| dua arah | `CALL_END` | `{robot_id, call_id, reason:"HANGUP"\|"TIMEOUT"\|"ERROR"}` |
| HMI → web (pasien/perawat memulai) | `CALL_REQUEST` | `{robot_id, call_id, from:{role:"PATIENT"\|"NURSE"}}` → muncul sebagai notifikasi di web, dokter menerima |

Yang perlu rekan kerjakan di gateway: routing `CALL_*` antara sesi UI (dashboard, per `ui_id`) dan sesi HMI robot (`ui_id` robot, mis. `TFUI5`, sudah ada di uplink robot sebagai label), dengan validasi (robot ada di roster; pengirim berwenang; satu panggilan aktif per robot; `call_id` unik; batas ukuran pesan). HMI tersambung sebagai sesi `SI UI` (token) — sama seperti BFF.

## 3. UI web (dokter)
- Tombol **Panggil** pada kartu robot di `/robots` (aktif bila robot online dan sedang `ARRIVED`/menunggu), dialog panggilan: video dokter kecil + video pasien besar, tombol akhiri, indikator mikrofon/kamera.
- Notifikasi masuk bila panggilan dimulai dari HMI (suara notifikasi di web boleh).
- Hanya peran `ADMIN`/`FARMASI`/`OPERATOR` (atau peran dokter baru) yang boleh memanggil.

## 4. Jaringan
- Satu subnet (hotspot/router yang sama): kandidat ICE `host` cukup, **tanpa server TURN**. Lihat `docs/panduan-jaringan-demo-hotspot.md`.
- Jaringan RS dengan firewall/NAT ketat: sediakan **coturn** (TURN/STUN) dan masukkan ke konfigurasi `iceServers` lewat env (jangan hardcode).

## 5. Privasi dan keselamatan
- **Tidak merekam** video/audio (tidak ada penyimpanan di server).
- Indikator jelas di HMI saat kamera/mikrofon aktif; panggilan dokter hanya saat robot berada di depan pasien (robot `WAITING`/`ARRIVED`) atau atas persetujuan perawat.
- Panggilan dari web tidak boleh menggerakkan robot; robot tetap menunggu sampai panggilan selesai sebelum berputar.
- Log panggilan (siapa, kapan, durasi) ke `h_*` audit backend, tanpa isi media.

## 6. Pengecualian aturan "minim suara"
Video call membutuhkan suara dua arah; itu satu-satunya pengecualian dari prinsip steril/minim-verbal di HMI.

## 7. Kriteria selesai (usulan)
1. Dokter di `https://...` menekan Panggil → HMI (atau simulator HMI) menerima `CALL_REQUEST`.
2. `CALL_ACCEPT` → video/audio 2 arah tersambung di jaringan lokal; `CALL_END` menutup bersih.
3. Tanpa HTTPS, tombol Panggil menampilkan pesan yang jelas (bukan galat kamera mentah).
4. Tes otomatis untuk routing `CALL_*` di gateway (satu panggilan aktif, robot offline, pengirim tidak berwenang).
