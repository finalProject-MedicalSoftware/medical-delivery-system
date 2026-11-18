# Desain HMI NEVO (tablet kepala robot) — DRAF UNTUK DISETUJUI

Tanggal 2026-11-18. Status: **menunggu persetujuan**; belum ada kode HMI. Sumber: brainstorming dengan pemilik proyek; gambar robot `medical-dashboard-monitoring/frontend/public/images/nevo/nevo-hero.webp`.

## 1. Tujuan dan alasan
HMI adalah **wajah dan pemandu** robot pengantar obat di ruang isolasi. Pasien menular (anak sampai lansia, Bahasa Indonesia) menerima obat **sendiri** tanpa kontak; HMI menunjukkan aturan pakai lewat animasi yang bisa dipahami tanpa membaca, memberi tahu robot berputar dan kapan obat diambil, dan membuka video call dengan dokter bila diperlukan. Saat berjalan di koridor layar hanya menampilkan **wajah** (privasi).

## 2. Sasaran, bukan sasaran, anti-sasaran
**Sasaran**: wajah ekspresif & hidup; aturan pakai terstruktur (dari SIMRS) dalam animasi; alur serah-terima tanpa sentuh (kamera → `PICKUP_CONFIRM`); video call dua arah (dokter memulai dulu); tahan putus Wi-Fi untuk fungsi inti; mode kiosk.
**Bukan sasaran sekarang**: pengenalan identitas wajah; merekam video/audio; percakapan suara (voice assistant); mode lain ala TIFA (musik, cruise, greet-guide); pemetaan/SLAM di tablet.
**Anti-sasaran (kegagalan walau "jalan")**: layar menampilkan nama/obat pasien di koridor; menganggap obat sudah diserahkan padahal belum; ketergantungan Wi-Fi untuk wajah/konfirmasi; menuntut sentuhan berulang; suara keras/ucapan panjang.

## 3. Batasan
Android (Advan/Infinix; versi menyusul), landscape, kamera depan + mikrofon + speaker. Build lewat **Gradle** (Capacitor). Data tanpa hardcode (env/konfigurasi runtime). Bahasa Indonesia. Pengembangan awal **di browser** (tanpa tablet), baru Android setelah uji web. Lisensi TTS: lihat §9.

## 4. Pendekatan yang dipertimbangkan
**Koneksi** (dipilih **C: hibrida**):
- A. hanya lokal ke robot (WS 8765 via ADB): tahan putus jaringan; video call tidak bisa.
- B. hanya Wi-Fi ke gateway: sederhana; mati bila Wi-Fi putus.
- **C. lokal sebagai jalur utama + gateway untuk video call dan pesan dokter.** Dipilih; biaya dua jalur.
**Penggambar wajah**: (1) SVG + animasi berparameter (framer-motion/WAAPI) — dipilih: tajam di semua layar, ringan, parameter ekspresi mudah; (2) Canvas 2D kustom — kontrol penuh, lebih banyak kode; (3) Rive/Lottie — animator-friendly, bergantung aset/alat. Bisa ditambah (3) kemudian untuk mode kartun/realistis.

## 5. Wajah: mode dan ekspresi
**Mode** (dapat dipilih di pengaturan, bukan hardcode): `eyes` (default: mata persegi membulat besar putih di layar hitam + alis + kelopak, sesuai desain robot), `friendly` (kartun ramah: mulut, pipi), `realistic` (semi-realistis), `emoji` (set wajah emoji lengkap: senang, sedih, marah, terkejut, bingung, menangis, tidur, cinta, dll.). Semua mode memakai **model ekspresi yang sama** (parameter: bentuk/ukuran mata, kelopak, kemiringan alis, mulut, pipi, arah pandang, warna aksen) sehingga ekspresi dan state tetap konsisten antar-mode.
**Hidup**: kedip acak 3–6 dtk, pandangan melayang halus, "napas" kecil; arah pandang mengikuti wajah dari kamera depan (opsional); transisi ekspresi memakai pegas, bukan loncat.
**Warna**: dasar hitam; aksen **merah** (merek) dan **cyan** (LED) sesuai robot.

| State robot (dari fase/robot) | Ekspresi | Tambahan |
|---|---|---|
| diam (IDLE) | netral/kedip | |
| menerima tugas (`OP` ENQUEUED) | semangat/mengangguk | nada lembut pendek |
| menjalankan tugas / berjalan | fokus, mata melirik arah gerak | wajah saja (tanpa data) |
| tiba (`ARRIVED`) | tersenyum menyapa | |
| menyampaikan informasi (`PRESENTING`) | ramah | animasi aturan pakai (§6) |
| menelepon dokter (`IN_CALL`) | "menelepon" → layar video | indikator kamera/mikrofon |
| berputar (`ROTATING`) | "sebentar ya" + indikator putar | beri aba-aba sebelum berputar |
| menunggu obat diambil (`WAITING_PICKUP`) | menunggu sabar; pengingat lembut di 60 dtk | panah ke tray |
| setelah diambil (`COLLECTED`) | senang/terima kasih | |
| tidak diambil (`NOT_COLLECTED`) | sedih ringan | memberitahu perawat |
| tersangkut (`ROBOT_STUCK`) | bingung | |
| baterai rendah | lelah | ikon baterai |
| tidur (15 mnt tanpa tugas) | mata menutup, layar redup | bangun saat OP baru/ada orang |
| galat | prihatin | |

## 6. Aturan pakai dalam animasi (dari `items[].dose`)
Per obat, ≤ ~7 dtk, tanpa teks panjang (teks besar sebagai pendukung, ≥ 28 px):
1. **Apa**: ikon obat sesuai satuan (tablet/kapsul/ampul/tetes/salep/inhaler) dengan jumlah per dosis (pecahan ½, ¼ divisualkan sebagai potongan).
2. **Berapa kali**: garis waktu matahari/bulan dengan `timesPerDay` titik; bila ada `doseTimes` tampilkan jamnya.
3. **Terhadap makan**: ikon piring + panah (sebelum/sesudah/bersama).
4. **Berapa lama**: kalender "N hari" bila ada.
5. **Cara**: animasi minum/kunyah/larutkan/tetes/oles/hirup; `INJECTION` → "perawat akan membantu".
6. **Obat khusus** (`handling`): ikon dingin/hati-hati agar tidak disimpan sembarang.
Resep lama (tanpa `dose`) jatuh ke teks `instructions` dengan ikon umum. Lebih dari satu obat: berurutan dengan penanda "1 dari 3"; tombol "ulangi" tersedia.

## 7. Alur di tujuan (sentuh seminimal mungkin)
1. Robot `GOAL_COMPLETE` → HMI `ARRIVED` (wajah menyapa; **baru sekarang** data obat boleh tampil).
2. `PRESENTING`: animasi aturan pakai; selesai → HMI kirim `PRESENT_DONE`.
3. Video call bila ada `CALL_REQUEST` (robot tidak berputar saat panggilan).
4. `ROTATING` (aba-aba visual/nada) → `WAITING_PICKUP`: kamera tray mendeteksi kosong → robot mengirim `PICKUP_CONFIRM` otomatis; tidak ada → timeout (pengingat 60 dtk, batas 120 dtk) → `NOT_COLLECTED` (perawat diberi tahu, obat dibawa pulang).
**Tombol selalu ada** (cadangan): "Panggil dokter/perawat" besar; pemicu panggilan oleh **perawat** (dari web), **pasien** (tombol), atau **isyarat angkat tangan** (≥ 1,5 dtk; deteksi tangan di tablet). Isyarat bersifat opsional dan dapat dimatikan.

## 8. Antarmuka data
**Lokal (utama)**: HMI ↔ WS lokal robot (`nevo_ws_bridge`, port 8765, via ADB reverse). Masuk: `READY`, `POSITION`, `EXPRESSION`, `GOAL_COMPLETE`, `ACK`, `ERROR`, `ROBOT_STUCK`, dan baru `PHASE`, `BRIEF`. Keluar: `PRESENT_DONE`, `CALL_STATE`, `PICKUP_CONFIRM` (manual, cadangan).
**`BRIEF`** (baru): ringkasan obat untuk satu tujuan, **dititipkan di `OP.tray_tasks[].brief`** oleh backend (dari SIMRS `items[]` dengan `dose`, `handling`) dan diteruskan robot ke HMI saat tiba, sehingga tetap bekerja tanpa Wi-Fi. Isi: obat (nama umum, jumlah, `dose`, `handling`); **tanpa nama pasien**.
**Gateway (sekunder)**: HMI sebagai sesi `SI UI` (`ui_id` robot, mis. `TFUI5`) untuk `CALL_*` (lihat `docs/untuk-rekan/HTTPS-DAN-VIDEO-CALL-DOKTER.md`).
Dedupe `message_id`; semua frame tidak dikenal diabaikan.

## 9. Suara
Prinsip: minim suara. Nada lembut dibuat di HMI (Web Audio): terima tugas, tiba, aba-aba putar, pengingat, terima kasih. Kalimat tetap (≈15, mis. "Silakan ambil obat Anda", "Terima kasih") **dipra-generate sekali** dengan Piper TTS (mesin MIT, offline) dan disertakan sebagai berkas audio; **tidak ada TTS saat berjalan**. Lisensi suara Indonesia (Piper/MMS-TTS `ind` CC-BY-NC): aman untuk proyek akademik non-komersial; **periksa lisensi dataset suara sebelum penggunaan komersial**. Panggilan video adalah satu-satunya pengecualian suara dua arah.

## 10. Kamera tablet
Deteksi wajah/kehadiran (ML Kit/MediaPipe) untuk: bangun dari tidur, mata mengikuti, auto-frame video call, isyarat tangan. **Tidak ada pengenalan identitas, tidak ada perekaman.** Indikator jelas saat kamera/mikrofon dipakai video call. Dapat dimatikan lewat pengaturan. (Kamera tray deteksi obat = proyek dev robotik, terpisah.)

## 11. Teknis
Vite + React + framer-motion; Capacitor (WebView `https`) → APK via **Gradle**; mode kiosk (app terkunci, auto-start, layar selalu nyala, redup saat tidur); konfigurasi runtime (alamat WS robot/gateway, mode wajah, ambang). Struktur: `src/face` (model ekspresi + renderer per mode), `src/states` (mesin status dari frame), `src/meds` (animasi aturan pakai), `src/link` (WS lokal + gateway + mock), `src/call` (WebRTC), `src/vision` (wajah/isyarat), `src/audio`. **Simulator dalam browser**: panel kontrol + robot palsu untuk menggerakkan semua state tanpa robot/tablet.

## 12. Tahap kerja (tiap tahap bisa diuji sendiri)
M1 wajah (mode `eyes`+`emoji`) + semua ekspresi di browser dengan panel simulator → M2 alur tiba–informasi–putar–tunggu dengan animasi aturan pakai (data SIMRS `dose`) → M3 klien WS lokal + `fake-robot`/robot TFRB5 → M4 kamera wajah/isyarat → M5 video call (dokter dulu, lalu pasien/perawat) → M6 mode `friendly`/`realistic` → M7 Capacitor + Gradle APK + kiosk. **Prasyarat paralel**: SIMRS `dose` (selesai, branch `feat/simrs-structured-dosage`), `BRIEF`/`PHASE` di backend & robot, kamera tray (dev robotik), HTTPS + signaling (rekan).

## 13. Kriteria keberhasilan
Pengguna baru (anak 8 th, lansia) paham aturan pakai satu obat dari animasi tanpa penjelasan; seluruh alur lokal jalan saat Wi-Fi dicabut; layar tidak pernah menampilkan nama pasien/obat sebelum `ARRIVED`; tidak ada interaksi sentuh yang wajib; transisi wajah ≥ 30 fps di tablet sasaran.

## 14. Terbuka / keputusan builder
Versi Android dan model tablet (menentukan WebView/kamera API dan anggaran animasi); pilihan pustaka deteksi isyarat; format `BRIEF` final bersama dev robotik; pustaka WebRTC pada WebView Android; status SIMRS baru `NOT_COLLECTED` + notifikasi perawat (SIMRS/backend); izin kamera tablet di mode kiosk.
