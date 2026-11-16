# Revisi Web — match ACK `MAPPING_FLAG` (bukan `code:MAPPING_FLAG`)

> Dokumen untuk agen/AI sisi web (`tifa-web`). Terpisah dari revisi robot
> (`robot-flag-pose-revisi.md`). Belum dieksekusi — spesifikasi siap-kerja.

## 1. Konteks

Respons robot untuk flag mapping adalah `code:"ACK"` +
`data.command_id:"MAPPING_FLAG"`, **bukan** `code:"MAPPING_FLAG"`.

- Frame `code:"MAPPING_FLAG"` yang masuk ke web selama ini adalah **echo UI**
  (`origin:"UI"`) — tanpa `x`/`y` — sehingga gate pose selalu gagal dan
  `m_goal` tidak pernah ter-insert.
- Setelah robot mengirim pose di ACK (revisi robot), web harus menangkap
  frame `ACK` yang `command_id`-nya `MAPPING_FLAG`.

## 2. File yang diubah

**`programTIFA/tifa-web/lib/wsClient.ts`** — handler inbound pesan WS robot.

| Lokasi | Keterangan |
|---|---|
| Baris **519** | Kondisi `else if` yang salah match |
| 519–543 | Body handler — sudah benar, TIDAK diubah |
| Baris 545 | Handler `ACK` umum — tidak mengganggu |

## 3. Perubahan (satu baris)

```ts
// SEBELUM
else if (msg.code === 'MAPPING_FLAG') {
// SESUDAH
else if (msg.code === 'ACK' && msg.data?.command_id === 'MAPPING_FLAG') {
```

Body tidak berubah (baca `robot_id`/`x`/`y`/`yaw`/`goal_name`, gate
`x`/`y`, INSERT `m_goal` CUSTOM ke `m_device.active_map_id`).

## 4. Verifikasi

1. Hanya kondisi baris 519 yang berubah.
2. Flag dari UI (setelah robot kirim pose) → log
   `[WS Robot] 📍 Mapping flag CUSTOM goal: ...` muncul dan `m_goal`
   ter-insert (`goal_type='CUSTOM'`, `x`/`y`/`yaw` terisi).
3. Echo UI tanpa `x`/`y` tidak memicu INSERT.

## 5. Ketergantungan

Efektif setelah revisi robot live. Urutan rilis: robot dulu, lalu match web.