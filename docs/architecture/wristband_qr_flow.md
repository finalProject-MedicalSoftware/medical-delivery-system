# Alur Cetak dan Pindai Gelang QR (fase mock)

## Tujuan
Gelang QR dipakai untuk demo serah-terima obat robot ke pasien rawat inap.
QR menghubungkan pasien fisik dengan halaman konfirmasi di SIMRS Dummy.

## Alur
1. Petugas membuka detail pasien rawat inap yang sudah dapat bed, klik tombol "Gelang".
2. Halaman `/pasien/[id]/gelang` menampilkan gelang berisi nama, MRN, tgl lahir dan umur, jenis kelamin, ruang, bed, barcode Code 128, dan QR.
3. Petugas mencetak halaman itu (tombol Cetak Gelang); hasil cetak hanya kotak gelang.
4. Saat robot tiba di ruang, petugas yang login memindai QR pada gelang.
5. QR terbuka ke `/scan/[mrn]?t=<token>`, lalu petugas menekan Konfirmasi Serah-Terima.
6. SIMRS Dummy mencatat status `MOCK_HANDOVER_CONFIRMED` dan audit trail.

## Aturan isi QR
- QR hanya berisi URL halaman scan + token tanda tangan: `{base}/scan/{mrn}?t={exp}.{sig}`.
- Token = `exp` (epoch detik) + HMAC-SHA256 atas `{mrn}:{exp}`; bukan MRN mentah,
  sehingga URL yang tersebar tidak bisa dipakai untuk menebak MRN lain.
- QR tidak menyimpan rekam medis; data pasien diambil server setelah petugas login.
- Token diverifikasi SEBELUM data pasien di-query. Token salah/kadaluarsa =
  halaman "QR Tidak Valid" tanpa membocorkan apakah MRN itu ada.
- Gelang hanya boleh dicetak untuk pasien rawat inap aktif (punya bed, belum pulang).

## Kode pada gelang (koreksi soal QR vs barcode)
- Gelang RS nyata lazim memakai barcode 1D "garis lurus" `Code 128` yang berisi
  MRN, dipindai scanner genggam untuk alur seperti BCMA. Praktik serupa dipakai
  di banyak rumah sakit.
- Standar GS1 (misal aksesori NHS) juga mengakui pelatar data 2D seperti
  `DataMatrix` atau `QR` pada rantai identifikasi; pemanfaatan QR di gelang
  juga makin umum pada RS "smart hospital", termasuk di Indonesia.
- Jadi memakai QR bukan kesalahan, tetapi melengkapi gelang dengan barcode
  Code 128 membuatnya mendekati gelang asli. Di SIMRS Dummy gelang memuat
  keduanya:
  - Barcode `Code 128` berisi MRN (dengan teks MRN terbaca manusia di bawahnya).
  - `QR` berisi URL `/scan/{mrn}?t=<token>` untuk alur demo pindai HP saat robot tiba.
- 1D Code 128 tidak dipakai untuk demo pindai HP karena kamera HP tidak
  membuka URL dari barcode 1D; QR tetap yang menuntun pindai.

## Ukuran gelang

- Gelang identitas dewasa umumnya 270 x 25 mm; area cetak gelang asli
  berkisar 100 sampai 136 mm. Pratinjau band dibuat dengan satuan mm:
  panjang band 270 mm, tebal 25 mm, dan muka cetak 133 mm berisi data
  pasien, barcode Code 128, dan QR 20 x 20 mm. Sisa band polos seperti
  material gelang asli.
- Di layar, band diperkecil 40% supaya muat di kartu halaman; hasil cetak
  diperbesar kembali ke ukuran asli lewat reset `scale` pada CSS cetak.
- CSS cetak memasang band `position: fixed` di tengah laman dan meminta
  `@page { size: A4 landscape }` supaya band 270 mm muat penuh di atas
  kertas. Bila dialog cetak memaksa portrait, pilih landscape manual agar
  band tidak terpotong.

## Base URL QR
- Variabel `QR_BASE_URL` opsional pada `.env`; bila kosong, pakai `NEXTAUTH_URL`.
- `QR_BASE_URL` berguna saat URL publik berbeda dari URL auth (misalnya domain khusus untuk pindai).
- Di lokal tanpa env, fallback ke `http://localhost:3000`.

## Batasan fase mock
- Pemindai QR fisik tidak ada; demo cukup membuka URL hasil QR di perangkat yang login.
- Konfirmasi hanya dari manusia yang login; robot tidak dapat mengonfirmasi sendiri.
