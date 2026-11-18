-- Rename status wire MOCK_* -> nama operasional (perubahan kontrak; konsumen sudah disesuaikan).
ALTER TYPE "DeliveryStatus" RENAME VALUE 'MOCK_IN_TRANSIT' TO 'IN_TRANSIT';
ALTER TYPE "DeliveryStatus" RENAME VALUE 'MOCK_ARRIVED_AT_ROOM' TO 'ARRIVED_AT_ROOM';
ALTER TYPE "DeliveryStatus" RENAME VALUE 'MOCK_HANDOVER_CONFIRMED' TO 'HANDOVER_CONFIRMED';

-- Riwayat event pengantaran (kolom teks).
UPDATE "h_delivery_event" SET "status_before" = regexp_replace("status_before", '^MOCK_', '') WHERE "status_before" LIKE 'MOCK\_%';
UPDATE "h_delivery_event" SET "status_after"  = regexp_replace("status_after",  '^MOCK_', '') WHERE "status_after"  LIKE 'MOCK\_%';

-- Event outbox yang belum terkirim membawa nama baru; yang sudah SENT dibiarkan sebagai arsip.
UPDATE "h_outbox_event"
SET "payload" = replace(replace(replace("payload"::text,
      '"MOCK_IN_TRANSIT"', '"IN_TRANSIT"'),
      '"MOCK_ARRIVED_AT_ROOM"', '"ARRIVED_AT_ROOM"'),
      '"MOCK_HANDOVER_CONFIRMED"', '"HANDOVER_CONFIRMED"')::jsonb
WHERE "status" IN ('PENDING', 'DEAD');
