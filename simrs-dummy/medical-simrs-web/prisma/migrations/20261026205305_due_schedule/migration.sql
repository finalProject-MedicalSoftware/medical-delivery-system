/*
  Warnings:

  - A unique constraint covering the columns `[prescription_id,due_at]` on the table `t_delivery_request` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "RepeatMode" AS ENUM ('DAILY', 'INTERVAL');

-- AlterTable
ALTER TABLE "t_delivery_request" ADD COLUMN     "dose_time" TEXT,
ADD COLUMN     "due_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "t_prescription" ADD COLUMN     "doseTimes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "intervalDays" INTEGER,
ADD COLUMN     "repeatMode" "RepeatMode" NOT NULL DEFAULT 'DAILY';

-- CreateIndex
CREATE UNIQUE INDEX "t_delivery_request_prescription_id_due_at_key" ON "t_delivery_request"("prescription_id", "due_at");
