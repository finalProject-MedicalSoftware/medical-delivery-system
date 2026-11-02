import { Prisma } from "@prisma/client";
import { deliveryStatusLabel } from "@/lib/delivery-status";

/**
 * F2 Outbox (kontrak §2.2/§2.3): event ditulis DALAM transaksi yang sama
 * dengan perubahan status delivery, lalu scripts/outbox-relay.ts
 * mengirimkannya ke {MONITORING_CALLBACK_URL}/webhooks/simrs.
 * At-least-once: penerima dedupe by eventId / idempotencyKey.
 */

export const OUTBOX_BACKOFF_MS = [1000, 5000, 30000, 120000] as const; // setelah attempt 1..4
export const OUTBOX_MAX_ATTEMPTS = 5; // attempt ke-5 gagal → DEAD

export type OutboxType =
  | "DELIVERY_CREATED"
  | "DELIVERY_STATUS_CHANGED"
  | "DELIVERY_ARRIVED"
  | "HANDOVER_CONFIRMED"
  | "DELIVERY_CANCELLED";

export const outboxTypeFor = (from: string | null, to: string): OutboxType => {
  if (from === null) return "DELIVERY_CREATED";
  switch (to) {
    case "MOCK_ARRIVED_AT_ROOM":
      return "DELIVERY_ARRIVED";
    case "MOCK_HANDOVER_CONFIRMED":
      return "HANDOVER_CONFIRMED";
    case "CANCELLED":
      return "DELIVERY_CANCELLED";
    default:
      return "DELIVERY_STATUS_CHANGED";
  }
};

// Format §3.2 key Kafka / dedupe relay.
export const outboxIdempotencyKey = (
  requestCode: string,
  from: string | null,
  to: string
): string => `simrs:${requestCode}:${from ?? ""}:${to}`;

export interface OutboxEnvelope {
  v: 1;
  eventId: string;
  idempotencyKey: string;
  type: string;
  occurredAt: string;
  requestCode: string;
  wardCode: null;
  data: Record<string, unknown>;
}

export function buildEnvelope(opts: {
  type: OutboxType;
  requestCode: string;
  idempotencyKey: string;
  data: Record<string, unknown>;
  eventId?: string;
  occurredAt?: string;
}): OutboxEnvelope {
  return {
    v: 1,
    eventId: opts.eventId ?? crypto.randomUUID(),
    idempotencyKey: opts.idempotencyKey,
    type: opts.type,
    occurredAt: opts.occurredAt ?? new Date().toISOString(),
    requestCode: opts.requestCode,
    wardCode: null,
    data: opts.data,
  };
}

export interface OutboxInput {
  requestCode: string;
  from: string | null;
  to: string;
  note?: string | null;
  // Khusus DELIVERY_ARRIVED / HANDOVER_CONFIRMED (kontrak §2.3).
  compartmentNo?: number | null;
  patientMrn?: string | null;
}

/**
 * Panggil TERAKHIR dalam $transaction yang sama dengan perubahan status.
 * Duplikat (race, retry) di-dedupe oleh unique idempotencyKey — abaikan.
 */
export async function enqueueOutbox(
  tx: Prisma.TransactionClient,
  input: OutboxInput
): Promise<void> {
  const type = outboxTypeFor(input.from, input.to);
  const idempotencyKey = outboxIdempotencyKey(input.requestCode, input.from, input.to);

  const data: Record<string, unknown> =
    type === "HANDOVER_CONFIRMED"
      ? {
          patientMrn: input.patientMrn ?? null,
          ...(input.compartmentNo !== null && input.compartmentNo !== undefined
            ? { compartmentNo: input.compartmentNo }
            : {}),
          method: "QR_SCAN",
        }
      : {
          from: input.from,
          to: input.to,
          statusLabel: deliveryStatusLabel(input.to),
          ...(input.note ? { note: input.note } : {}),
          ...(type === "DELIVERY_ARRIVED" &&
          input.compartmentNo !== null &&
          input.compartmentNo !== undefined
            ? { compartmentNo: input.compartmentNo }
            : {}),
          source: "simrs",
        };

  const envelope = buildEnvelope({ type, requestCode: input.requestCode, idempotencyKey, data });

  await tx.outboxEvent.createMany({
    data: {
      eventId: envelope.eventId,
      idempotencyKey,
      type,
      requestCode: input.requestCode,
      wardCode: null,
      payload: envelope as unknown as Prisma.InputJsonValue,
      status: "PENDING",
    },
    skipDuplicates: true,
  });
}
