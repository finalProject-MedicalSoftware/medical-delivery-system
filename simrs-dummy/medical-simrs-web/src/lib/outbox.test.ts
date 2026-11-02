import { describe, it, expect } from "vitest";
import {
  OUTBOX_BACKOFF_MS,
  OUTBOX_MAX_ATTEMPTS,
  outboxTypeFor,
  outboxIdempotencyKey,
  buildEnvelope,
} from "./outbox";

describe("outbox", () => {
  it("backoff entries match max attempts (last attempt → DEAD)", () => {
    expect(OUTBOX_BACKOFF_MS.length).toBe(OUTBOX_MAX_ATTEMPTS - 1);
  });

  it("maps transition → event type per contract §2.3", () => {
    expect(outboxTypeFor(null, "DELIVERY_REQUESTED")).toBe("DELIVERY_CREATED");
    expect(outboxTypeFor("PENDING_INTEGRATION", "MOCK_IN_TRANSIT")).toBe("DELIVERY_STATUS_CHANGED");
    expect(outboxTypeFor("MOCK_IN_TRANSIT", "MOCK_ARRIVED_AT_ROOM")).toBe("DELIVERY_ARRIVED");
    expect(outboxTypeFor("MOCK_ARRIVED_AT_ROOM", "MOCK_HANDOVER_CONFIRMED")).toBe(
      "HANDOVER_CONFIRMED"
    );
    expect(outboxTypeFor("DELIVERY_REQUESTED", "CANCELLED")).toBe("DELIVERY_CANCELLED");
    expect(outboxTypeFor("MOCK_ARRIVED_AT_ROOM", "MOCK_IN_TRANSIT")).toBe("DELIVERY_STATUS_CHANGED");
  });

  it("formats idempotency key (create has empty from-segment)", () => {
    expect(outboxIdempotencyKey("DELIV-20261026-0001", null, "DELIVERY_REQUESTED")).toBe(
      "simrs:DELIV-20261026-0001::DELIVERY_REQUESTED"
    );
    expect(outboxIdempotencyKey("DELIV-20261026-0001", "MOCK_IN_TRANSIT", "MOCK_ARRIVED_AT_ROOM")).toBe(
      "simrs:DELIV-20261026-0001:MOCK_IN_TRANSIT:MOCK_ARRIVED_AT_ROOM"
    );
  });

  it("envelope shape matches contract §2.3", () => {
    const env = buildEnvelope({
      type: "DELIVERY_STATUS_CHANGED",
      requestCode: "DELIV-20261026-0001",
      idempotencyKey: "simrs:DELIV-20261026-0001:PENDING_INTEGRATION:MOCK_IN_TRANSIT",
      data: { from: "PENDING_INTEGRATION", to: "MOCK_IN_TRANSIT", source: "simrs" },
      eventId: "uuid-test",
      occurredAt: "2026-10-27T00:00:00.000Z",
    });
    expect(env).toEqual({
      v: 1,
      eventId: "uuid-test",
      idempotencyKey: "simrs:DELIV-20261026-0001:PENDING_INTEGRATION:MOCK_IN_TRANSIT",
      type: "DELIVERY_STATUS_CHANGED",
      occurredAt: "2026-10-27T00:00:00.000Z",
      requestCode: "DELIV-20261026-0001",
      wardCode: null,
      data: { from: "PENDING_INTEGRATION", to: "MOCK_IN_TRANSIT", source: "simrs" },
    });
  });
});
