-- Flyway Migration V9: mission queue — one robot, many missions.
-- Robot NEVO-01 menjalankan satu misi pada satu waktu; misi berikutnya berstatus
-- QUEUED dan otomatis mulai saat misi aktif SUCCEEDED / CANCELLED.
ALTER TYPE mission_status ADD VALUE IF NOT EXISTS 'QUEUED';