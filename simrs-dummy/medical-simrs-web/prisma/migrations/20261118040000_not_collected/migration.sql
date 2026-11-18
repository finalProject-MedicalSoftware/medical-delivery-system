-- Obat tidak diambil di tujuan (timeout kamera): status terminal + penanda tindak lanjut perawat.
ALTER TYPE "DeliveryStatus" ADD VALUE 'NOT_COLLECTED';
ALTER TABLE "t_delivery_request"
  ADD COLUMN "not_collected_ack_at" TIMESTAMP(3),
  ADD COLUMN "not_collected_ack_by" TEXT;
