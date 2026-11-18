-- Tahap 2/3: prioritas resep, alergi pasien, penanganan khusus obat, ambang stok, riwayat stok.
CREATE TYPE "Priority" AS ENUM ('ROUTINE', 'URGENT', 'STAT');
CREATE TYPE "Handling" AS ENUM ('NONE', 'COLD_CHAIN', 'CONTROLLED', 'HIGH_ALERT');

ALTER TABLE "m_patient" ADD COLUMN "allergies" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "t_prescription" ADD COLUMN "priority" "Priority" NOT NULL DEFAULT 'ROUTINE';
ALTER TABLE "m_medicine"
  ADD COLUMN "min_stock" INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN "handling" "Handling" NOT NULL DEFAULT 'NONE';

CREATE TABLE "h_stock_movement" (
  "id" TEXT NOT NULL,
  "medicine_id" TEXT NOT NULL,
  "delta" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "prescription_id" TEXT,
  "actor_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "h_stock_movement_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "h_stock_movement_medicine_id_created_at_idx" ON "h_stock_movement"("medicine_id", "created_at");
ALTER TABLE "h_stock_movement" ADD CONSTRAINT "h_stock_movement_medicine_id_fkey"
  FOREIGN KEY ("medicine_id") REFERENCES "m_medicine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
