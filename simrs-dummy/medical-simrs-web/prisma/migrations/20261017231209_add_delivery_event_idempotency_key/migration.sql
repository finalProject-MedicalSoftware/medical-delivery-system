/*
  Warnings:

  - A unique constraint covering the columns `[idempotency_key]` on the table `delivery_events` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "delivery_events" ADD COLUMN "idempotency_key" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "delivery_events_idempotency_key_key" ON "delivery_events"("idempotency_key");
