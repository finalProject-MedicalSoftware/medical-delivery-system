-- Tautkan pasien rawat inap ke bed spesifik agar hunian bed live.
-- Aditif dan non-destruktif: kolom nullable, tanpa hapus data.
ALTER TABLE "patients" ADD COLUMN "bed_id" TEXT;

ALTER TABLE "patients" ADD CONSTRAINT "patients_bed_id_fkey"
  FOREIGN KEY ("bed_id") REFERENCES "beds"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "patients_bed_id_idx" ON "patients"("bed_id");
