import { describe, it, expect } from "vitest";
import { DeliveryStatus, PrescriptionStatus } from "@prisma/client";
import {
  DELIVERY_STATUS_LABELS,
  DELIVERY_STATUS_TONES,
  DELIVERY_TRANSITIONS,
  ACTIVE_DELIVERY_STATUSES,
  PRESCRIPTION_STATUS_LABELS,
  deliveryStatusLabel,
  deliveryStatusTone,
  prescriptionStatusLabel,
} from "@/lib/delivery-status";

describe("lib/delivery-status", () => {
  it("setiap status delivery punya label dan tone non-kosong", () => {
    for (const status of Object.values(DeliveryStatus)) {
      expect(DELIVERY_STATUS_LABELS[status].length).toBeGreaterThan(0);
      expect(DELIVERY_STATUS_TONES[status].length).toBeGreaterThan(0);
    }
  });

  it("label status MOCK_ diawali [MOCK]; status nyata tidak", () => {
    for (const status of Object.values(DeliveryStatus)) {
      const label = DELIVERY_STATUS_LABELS[status];
      if (status.startsWith("MOCK_")) {
        expect(label.startsWith("[MOCK]")).toBe(true);
      } else {
        expect(label).not.toContain("[MOCK]");
        // Label lama "Mock: Transit" tidak boleh nyasar lagi.
        expect(label).not.toContain("Mock:");
      }
    }
  });

  it("target semua transisi adalah status delivery yang dikenal", () => {
    const known = Object.values(DeliveryStatus);
    for (const [from, targets] of Object.entries(DELIVERY_TRANSITIONS)) {
      expect(known).toContain(from);
      for (const to of targets!) {
        expect(known).toContain(to);
        expect(to).not.toBe(from);
      }
    }
  });

  it("MOCK_HANDOVER_CONFIRMED hanya bisa dicapai dari MOCK_ARRIVED_AT_ROOM", () => {
    for (const [from, targets] of Object.entries(DELIVERY_TRANSITIONS)) {
      if (from === "MOCK_ARRIVED_AT_ROOM") {
        expect(targets).toEqual(["MOCK_HANDOVER_CONFIRMED"]);
      } else {
        expect(targets).not.toContain("MOCK_HANDOVER_CONFIRMED");
      }
    }
  });

  it("ACTIVE_DELIVERY_STATUSES subset status dikenal, tanpa batal/serah-terima", () => {
    const known = Object.values(DeliveryStatus);
    for (const status of ACTIVE_DELIVERY_STATUSES) {
      expect(known).toContain(status);
    }
    expect(ACTIVE_DELIVERY_STATUSES).toContain("MOCK_ARRIVED_AT_ROOM");
    expect(ACTIVE_DELIVERY_STATUSES).not.toContain("MOCK_HANDOVER_CONFIRMED");
    expect(ACTIVE_DELIVERY_STATUSES).not.toContain("CANCELLED");
  });

  it("setiap status resep punya label non-kosong", () => {
    for (const status of Object.values(PrescriptionStatus)) {
      expect(PRESCRIPTION_STATUS_LABELS[status].length).toBeGreaterThan(0);
    }
  });

  it("helper label mengembalikan fallback untuk kode tak dikenal", () => {
    expect(deliveryStatusLabel("BUKAN_STATUS")).toBe("BUKAN_STATUS");
    expect(deliveryStatusLabel("BUKAN_STATUS", "-")).toBe("-");
    expect(prescriptionStatusLabel("BUKAN_STATUS")).toBe("BUKAN_STATUS");
    expect(deliveryStatusTone("BUKAN_STATUS", "slate")).toBe("slate");
  });

  it("helper label/tone mengembalikan nilai kanonik untuk kode dikenal", () => {
    expect(deliveryStatusLabel("DELIVERY_REQUESTED")).toBe(
      DELIVERY_STATUS_LABELS.DELIVERY_REQUESTED
    );
    expect(deliveryStatusTone("PENDING_INTEGRATION")).toBe(
      DELIVERY_STATUS_TONES.PENDING_INTEGRATION
    );
    expect(prescriptionStatusLabel("DRAFT")).toBe(PRESCRIPTION_STATUS_LABELS.DRAFT);
  });
});
