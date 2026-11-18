# Catatan untuk rekan: perubahan lintas-repo dari sisi SIMRS

Branch yang berisi ini: `feat/simrs-robot-gating-rename` (repo `medical-simrs-dummy`). Perubahan di repo rekan **belum di-push**; tersedia sebagai patch di `docs/patches/` supaya bisa ditinjau dan diterapkan sendiri (`git apply`), atau kami push ke branch terpisah di repo masing-masing bila disetujui.

## 1. Pengantaran masuk monitoring hanya setelah "Kirim ke Robot"
Detail: `KONTRAK-DATA-SIMRS-KE-WEB.md` (bagian "ATURAN PENTING"). Dampak ke konsumen: status pertama yang terlihat `PENDING_INTEGRATION` (bukan `DELIVERY_REQUESTED`); event pertama `DELIVERY_CREATED` datang saat dikirim ke robot.

## 2. Pasien yang dipanggil
SIMRS `GET /monitoring/patients?deliveryReady=true` hanya memberi pasien yang punya pengantaran terkirim; field `robotEligible`, `robotReason`. Pasien tidak menular boleh dengan alasan wajib di SIMRS.

## 3. Rename status `MOCK_*` (perubahan kontrak, serentak)
`IN_TRANSIT`, `ARRIVED_AT_ROOM`, `HANDOVER_CONFIRMED`. SIMRS menerima nama lama pada input POST; semua keluaran memakai nama baru.

## 4. Patch per repo (`docs/patches/`)
| Patch | Isi | Terapkan di |
|---|---|---|
| `backend.patch` | `SimrsClientService.getPatients` memakai `deliveryReady=true` + verifikasi `robotEligible`; `MissionPlanningService` memakai `robotEligible`; rename status di `SimrsClientService`, `SimulatedRobotService`, `ApiErrorSanitizer`; tes diperbarui (+1 tes) | `medical-backend` |
| `dashboard.patch` | `/missions/create` memakai `robotEligible` + menampilkan `robotReason`; kartu antrean di `dashboard/page.tsx` menampilkan alasan robot; perbaikan type error `api/ws/command/route.ts` (`code as string`); sample YAML | `WEB-MONITORING` (folder `medical-dashboard-monitoring`) |
| `ws.patch` | rename status di `scripts/check.js` | `medical-ws` |

Terapkan: `cd <repo> && git checkout -b feat/simrs-integration && git apply <path>/docs/patches/<nama>.patch`.

## 4b. Integrasi robot fisik (TFRB5) — detail di `ANALISIS-INTEGRASI-ROBOT.md`
Gateway: gate `ALLOW_ROBOT_MOTION`, konversi frame TIFA (`src/core/robot-frames.js`), uplink ke backend. Backend: `RealMissionService` + `RobotEventApi` (`/internal/robot-events`). Dashboard: teleop aktif bila `ALLOW_ROBOT_MOTION=true`. Semua bawaan tetap terkunci/simulasi.

**Catatan patch:** patch dibuat terhadap kondisi folder lokal (hub commit `bc02096`), yang LEBIH BARU daripada `main` repo masing-masing (mis. `RealRobotAdapter`, `app/api/ws/*` belum ada di remote). Terapkan setelah repo rekan berisi kondisi itu, atau salin file yang tercantum di patch.

## 5. Yang perlu diverifikasi rekan
- `mvn test`: 7 tes lama gagal **sebelum** perubahan ini (`RobotCommandP1Test`, `RobotRegistryRestP4Test`, `MissionPlanningServiceTest` fixture); fixture yang terakhir sudah diperbaiki di patch, sisanya tidak disentuh.
- Backend: `medicineName` pada antrean kini terisi dari `items[]` (kontrak aditif sebelumnya).
- Deploy serentak SIMRS + backend + dashboard karena rename status.

## 6. Tambahan 2026-11-18 (belum di branch rekan; ada di hub)
- Gateway: `PICKUP_CONFIRM` dan `PHASE` ikut diteruskan ke `/internal/robot-events` (`BACKEND_EVENT_CODES`).
- Backend `RealMissionService`: `PICKUP_CONFIRM {collected:false}` → SIMRS `NOT_COLLECTED` (+2 tes). Detail kontrak: `KONTRAK-DATA-SIMRS-KE-WEB.md`.
- SIMRS: `items[].dose` terstruktur; status `NOT_COLLECTED`.
