# DEPLOY-RUNBOOK — Set di Server (pola tifa-web)

> Dibuat untuk deploy web monitoring Nevo ke server. Pola asal: runbook deploy tifa-web (berhasil dipraktikkan 3–4/11/2026). Sesuaikan detail infra (psql, PM2/systemd) dengan keputusan senior saat eksekusi.

Urutan aman:

1. **Ambil kode**: `git pull` ke commit target yang sudah disepakati (semua perubahan sudah di-commit; tidak ada file state runtime yang terbawa).
2. **Install & build**: `npm ci && npm run build`. **JANGAN `npm run dev` di server** — script dev milik mesin lokal (di tifa-web script itu membuka cloudflared tunnel). Server prod jalankan `npm start` / `next start`.
3. **Env di server** (`.env` — tidak pernah dicommit; aturan 4):
   - `BE_URL` = URL backend Nevo prod.
   - `ROBOT_USERNAME` / `ROBOT_PASSWORD` = kredensial login BE untuk auto-fetch JWT (lihat TOKEN-FLOW.md).
   - `WS_GATEWAY_URL` = gateway Nevo (pola tifa: `wss://…`).
4. **DB server**: samakan daftar device — jalankan seed **idempotent** (guard `WHERE NOT EXISTS`) via psql, aman dijalankan ulang; atau insert manual hanya unit yang dibutuhkan.
5. **`data/settings.json` di server**: isi identitas web prod (pola tifa: `uiId` + `robotId` instans server, bukan identitas lokal). Jangan pernah menyalin `data/settings.json` lokal ke server — itu state runtime per lingkungan, tidak ikut PR/deploy. Setelah deploy, recycle via UI **Turn Off → Turn On**.
6. **Verifikasi**:
   - Build memuat auto-fetch token (pola tifa: `grep -rl "fetchJwtToken" .next/server/ | head -1`).
   - Buka `/settings` → Turn On → cek log urutan: `✅ Connected` → `📤 SI …` → `✅ Session established as …!`.
7. **Gateway tidak disentuh**: deploy web tidak mengubah gateway. Uji robot fisik (downlink nyata) selalu terpisah dan butuh izin owner.

## Catatan lintas-lingkungan

- Identitas UI **unik per instance** web. Web lokal dan web prod boleh online bersamaan karena slot (`ui_id`) berbeda — persis pola multi-robot tifa-web.
- Multi-lingkungan = multi-`settings.json` + multi-env, bukan multi-kode.
