-- AlterTable
ALTER TABLE "patients" ADD COLUMN     "diagnosis" TEXT,
ADD COLUMN     "discharge_note" TEXT,
ADD COLUMN     "discharged_at" TIMESTAMP(3),
ADD COLUMN     "is_infectious" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "patients_discharged_at_idx" ON "patients"("discharged_at");
