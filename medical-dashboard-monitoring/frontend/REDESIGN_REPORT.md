Implementasi UI/UX NEVO — 5 November 2026

Implementasi dilakukan di `medical-dashboard-monitoring/frontend/`. Dokumen ini mencatat perubahan dan bukti verifikasi, bukan spesifikasi desain baru. Seluruh `design.md`, sepuluh PNG, dan enam halaman PDF telah dibaca/diinspeksi sebelum perubahan source. Referensi tidak diubah.

Design system kini menggunakan sidebar burgundy dengan menu putih dan menu aktif putih/merah, Plus Jakarta Sans lokal, palet #58585B / #FFFFFF / #B34444 / #EC1C24 beserta warna turunan dan status, serta komponen heading, kartu statistik, empty state, brand, dan artwork robot reusable. Form, tabel, tab, tombol, status, loading/error, dan halaman pendukung menggunakan styling bersama.

Pemetaan berikut berdasarkan isi visual PNG, bukan nama berkas. Semua nama PNG berada di `../../ref/` dan diawali `Gambar ChatGPT 5 Nov 2026, `.

| PNG | Halaman / route | Implementasi |
| --- | --- | --- |
| 01.47.35-1.png | Dashboard — /dashboard | Hero robot kanan, empat statistik, panel misi dan antrean pengiriman, riwayat misi |
| 01.47.36-2.png | Misi — /missions | Heading, statistik, filter, tabel dan aksi misi lama |
| 01.47.37-3.png | Kendali Robot — /robots | Preview ilustrasi berlabel, directional controls, Stop, target robot, roster dan kontrol mapping |
| 01.47.40-4.png | Monitoring Live — /tracking | Peta dominan, identitas robot, panel telemetri dan event |
| 01.47.42-5.png | Kendali Navigasi — /missions/create | Form tujuan kiri, peta kanan, pemilihan waypoint, antrean pasien/manifest dalam panel yang dapat dibuka |
| 01.47.44-6.png | Peta & Waypoint — /maps | Tab dan style peta diselaraskan; upload ROS, waypoint dan pemetaan ruang tetap tersedia |
| 01.47.45-7.png | Registrasi Robot — /robots/registry | Full-body kiri, kartu data registrasi kanan, form registrasi admin |
| 01.47.46-8.png | Log Aktivitas — /notifications | Filter status, pencarian, statistik kejadian sesi, tabel dan tautan detail misi |
| 01.47.47-9.png | Pengaturan — /settings | Pusat akses Akun, SIMRS, Sistem, Notifikasi, ilustrasi kanan, akses pengguna untuk admin |
| 01.47.49-10.png | Login — /login | Brand/ilustrasi kiri bawah dan form login kanan, tombol tampil/sembunyikan password |

Halaman tanpa PNG final menggunakan design system yang sama:

| Halaman | Route / perubahan |
| --- | --- |
| Laporan | /reports — header dan tombol periode/ekspor, kartu/tabel mengikuti token bersama |
| Integrasi SIMRS | /simrs — statistik operasional, detail diagnostik dapat dibuka, sinkronisasi dan tabel lama dipertahankan |
| Akun | /account — informasi profil dan akses Edit Akun |
| Edit Akun | /account/edit — route baru untuk form penggantian password yang sebelumnya ada di Akun |
| Manajemen Pengguna | /users — header, kartu/form/tabel bersama, aksi dan pemeriksaan role lama dipertahankan |
| Pengaturan Sistem | /settings/system — form koneksi/relay lama dipindahkan dari /settings, handler dan endpoint sama |
| Pengaturan Notifikasi | /settings/notifications — penjelasan kemampuan notifikasi yang tersedia, status gangguan dan akses log; tidak ada preferensi palsu |
| Detail Misi | /missions/[id] — heading dan styling bersama; timeline dan cancel tetap tersedia |
| Offline | /offline — brand NEVO, aksi reload lama |
| Loading, error, not found | Komponen pendukung baru; PwaStatus diselaraskan secara visual |

Route lama tetap ada. Redirect /control → /missions/create, /monitoring → /tracking, dan /mapping → /maps tetap menggunakan konfigurasi lama. /settings sekarang menjadi hub; konfigurasi koneksi dapat diakses melalui kartu Sistem. Kartu Sistem dan Manajemen Pengguna ditampilkan sebagai akses admin; aturan server tidak diubah.

Robot diekstraksi langsung dari gambar tertanam beserta alpha mask PDF `NEVO - Desain Visual (1).pdf`, di-crop berdasarkan batas transparansi, lalu dikompresi ke WebP. Proporsi gambar dipertahankan. Tidak menggunakan image generation atau robot generik. Semua aset hasil ekstraksi diperiksa secara visual.

| Aset di public/images/nevo/ | Sumber PDF | Dimensi | Ukuran | Pemakaian |
| --- | --- | --- | --- | --- |
| nevo-hero.webp | Halaman 1, image xref 24 | 1100 × 1000 | 49.200 byte | Dashboard dan Login |
| nevo-fullbody.webp | Halaman 2, image xref 30 | 544 × 1200 | 49.276 byte | Registrasi, Pengaturan, preview Kendali Robot |
| nevo-head.webp | Halaman 4, image xref 49 | 767 × 640 | 33.710 byte | Identitas Monitoring Live |
| nevo-rear.webp | Halaman 3, image xref 43 | 450 × 1000 | 45.260 byte | Aset tambahan tampak belakang, belum dipasang pada halaman |

Halaman 1–5 digunakan untuk memeriksa kepala, monitor hitam/mata putih, headset merah, modul samping biru, sensor depan, panel bodi, LED vertikal, nampan/keranjang dan basis. Halaman 5 menjadi pembanding bentuk/warna panel; halaman 6 hanya dibaca sebagai moodboard. Tidak ada halaman PDF utuh maupun berkas PDF di folder publik frontend. `brand-ribbon.svg` adalah dekorasi UI berbasis SVG, bukan ilustrasi robot atau screenshot mockup.

Berkas source yang diubah, relatif terhadap folder frontend:

- `app/globals.css`
- `app/lib/dictionaries.ts`
- `app/components/AppShell.tsx`
- `app/components/PwaStatus.tsx`
- `app/components/UserDropdown.tsx`
- `app/login/page.tsx`
- `app/dashboard/page.tsx`
- `app/missions/page.tsx`
- `app/missions/create/page.tsx`
- `app/missions/[id]/page.tsx`
- `app/tracking/page.tsx`
- `app/robots/page.tsx`
- `app/robots/registry/page.tsx`
- `app/maps/page.tsx`
- `app/maps/MapViewer.tsx`
- `app/notifications/page.tsx`
- `app/reports/page.tsx`
- `app/settings/page.tsx`
- `app/simrs/page.tsx`
- `app/account/page.tsx`
- `app/users/page.tsx`
- `app/offline/page.tsx`

Berkas baru di frontend:

- `app/components/NevoUI.tsx`
- `app/account/AccountView.tsx`
- `app/account/edit/page.tsx`
- `app/settings/system/page.tsx`
- `app/settings/notifications/page.tsx`
- `app/loading.tsx`
- `app/error.tsx`
- `app/not-found.tsx`
- `public/images/nevo/nevo-hero.webp`
- `public/images/nevo/nevo-fullbody.webp`
- `public/images/nevo/nevo-head.webp`
- `public/images/nevo/nevo-rear.webp`
- `public/images/nevo/brand-ribbon.svg`
- `public/fonts/plus-jakarta-sans-latin.woff2`
- `public/fonts/OFL.txt`
- `REDESIGN_REPORT.md`

Font Plus Jakarta Sans diambil dari Google Fonts, disimpan lokal dengan lisensi OFL; tidak memerlukan request font eksternal saat website dijalankan.

Artefak pemeriksaan di workspace `D:/SEMESTER 7/TA/tmp/`:

- `inspect_nevo_pdf.py`, `extract_nevo_assets.py`: helper render/ekstraksi.
- `pdfs/nevo/page-1.png` sampai `page-6.png`: render referensi PDF, bukan screenshot website.
- `pdf-tools/`: dependensi ekstraksi PDF lokal.
- Hasil audit perubahan kode dan smoke test HTTP dipindahkan ke `test-results/nevo-redesign-validation/evidence/prior-boundary-results.json` dan `prior-http-results.json`. Script pengujian sementara dihapus setelah audit lanjutan.

Hasil pengujian aktual:

| Pemeriksaan | Hasil dan batasnya |
| --- | --- |
| npm.cmd ci --no-audit --no-fund | Berhasil menginstal dependensi dari lockfile; package/lockfile tidak diubah |
| npm.cmd run build | Berhasil, Next.js 15.5.28, 25/25 static generation, pemeriksaan tipe build lulus |
| node node_modules/typescript/bin/tsc --noEmit | Exit 0 setelah build akhir |
| git diff --check -- app public | Exit 0; hanya pemberitahuan konversi LF/CRLF dari Git |
| Audit batas perubahan | 54 pemeriksaan lulus, 0 gagal; 206 node perilaku dipertahankan terhadap HEAD 0143a36bae769ee1de749717d74da4582035a166 |
| Smoke test produksi 127.0.0.1:3107 | 33 pemeriksaan lulus, 0 gagal: 20 route HTTP 200, konten login SSR, 3 redirect 307, 8 aset/PWA resources HTTP 200, route tidak dikenal 404 |
| GET /api/proxy/auth/me | 502; autentikasi backend tidak dapat diverifikasi melalui server uji |
| GET /api/ws/command tanpa sesi | 401; tidak ada perintah POST dikirim |
| Unit/E2E suite bawaan | Tidak tersedia script test di package.json |
| Browser automation | Runtime melaporkan “No browser is available”; daftar browser kosong |
| Screenshot hasil website | Tidak tersedia; tidak dibuat screenshot pengganti |

Audit AST membandingkan useEffect/useCallback/useMemo, fungsi/handler non-JSX, fetch/request, interval, pemanggilan perintah, serta pointer events teleoperasi. Literal warna canvas dinormalisasi dalam pembandingan karena merupakan perubahan visual. Audit juga memeriksa berkas API/BFF, library integrasi, konfigurasi Next, package/lockfile, layout, manifest dan service worker terhadap baseline. Halaman akun dan pengaturan dibandingkan dengan berkas tujuan pemindahannya.

Dengan batas pemeriksaan statis tersebut, yang terverifikasi tetap adalah:

- Request autentikasi/CSRF/logout dan auth guard AppShell.
- Polling, langganan SSE, reconnect, serta pemrosesan telemetry/event.
- Handler dispatch/manifest/cancel misi dan payload yang sudah ada.
- Handler teleop hold/WASD, interval, nilai gerak, dan perintah mapping. Tombol Stop memakai operasi nol yang sudah tersedia.
- Handler upload/manajemen peta dan waypoint, transform/koordinat/interaksi canvas; hanya warna/layout peta yang diubah.
- Request/sinkronisasi SIMRS, registrasi robot, manajemen pengguna, serta ekspor laporan.
- Handler perubahan password dan pengaturan koneksi setelah dipindahkan ke halaman tersendiri.
- Logic PWA/service worker dan seluruh berkas API/BFF tidak diubah.

Tidak ada source backend Spring Boot, database/migration, gateway, maupun integrasi SIMRS yang diedit untuk pekerjaan ini. Perubahan pengguna yang sudah ada sebelum pekerjaan—termasuk .dockerignore, berkas Docker, penghapusan script dan perubahan migration SIMRS—dibiarkan. Status Git keseluruhan karena itu mengandung perubahan di luar daftar redesign.

Kendala dan verifikasi yang masih diperlukan:

- Tidak dapat menyatakan tampilan identik dengan PNG. Implementasi disusun dari referensi, tetapi belum ada perbandingan screenshot hasil render website.
- Breakpoint desktop/tablet/mobile telah ditulis, termasuk drawer sidebar, susunan form/peta dan kontrol arah yang dapat menyusut; belum diuji secara visual/interaktif pada viewport nyata.
- Backend auth merespons 502 pada server uji. Login, RBAC end-to-end, data SIMRS nyata, upload peta, dispatch misi, teleop robot fisik dan instalasi/update/offline PWA belum diverifikasi lewat browser. HTTP 200 pada route terproteksi hanya membuktikan shell halaman dapat disajikan.
- Kamera belum tersedia di source yang diaudit. Kendali Robot menampilkan aset NEVO dengan label eksplisit bahwa itu ilustrasi, bukan feed live.
- API profil saat ini mendukung baca profil dan ganti password. Edit Akun mempertahankan kemampuan itu; tidak membuat simpan nama/email yang tidak didukung.
- Tidak ada API preferensi notifikasi. Halaman Notifikasi menjelaskan kemampuan yang tersedia tanpa tombol penyimpanan palsu.
- Log Aktivitas menggunakan kejadian misi yang diterima dalam sesi, bukan arsip historis lengkap. Statistiknya berasal dari kejadian sesi tersebut.
- Batas keselamatan teleop yang sudah ada, termasuk pengendalian WASD dan status robot fisik, tetap memerlukan uji operasional tersendiri; audit source bukan bukti keselamatan robot.

Server produksi lokal untuk smoke test dijalankan pada `http://127.0.0.1:3107`; port 3100 telah digunakan proses lain dan tidak dihentikan.

