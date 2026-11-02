-- CreateTable
CREATE TABLE "h_outbox_event" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "request_code" TEXT NOT NULL,
    "ward_code" TEXT,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "h_outbox_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "h_outbox_event_event_id_key" ON "h_outbox_event"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "h_outbox_event_idempotency_key_key" ON "h_outbox_event"("idempotency_key");

-- CreateIndex
CREATE INDEX "h_outbox_event_status_next_attempt_at_idx" ON "h_outbox_event"("status", "next_attempt_at");
