import { describe, it, expect } from "vitest";
import { DeliveryStatus, PrescriptionStatus } from "@prisma/client";
import {
  DELIVERY_STATUS_LABELS,
  DELIVERY_STATUS_TONES,
  DELIVERY_TRANSITIONS,
  ACTIVE_DELIVERY_STATUSES,
  MONITORING_ACTIVE_STATUSES,
  isMonitoringVisible,
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

  it("label status tidak memuat penanda mock", () => {
    for (const label of Object.values(DELIVERY_STATUS_LABELS)) {
      expect(label).not.toMatch(/mock/i);
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

  it("HANDOVER_CONFIRMED hanya bisa dicapai dari ARRIVED_AT_ROOM", () => {
    for (const [from, targets] of Object.entries(DELIVERY_TRANSITIONS)) {
      if (from === "ARRIVED_AT_ROOM") {
        // dari tiba: serah terima (manusia, QR) atau obat tidak diambil (timeout robot)
        expect(targets).toEqual(["HANDOVER_CONFIRMED", "NOT_COLLECTED"]);
      } else {
        expect(targets).not.toContain("HANDOVER_CONFIRMED");
      }
    }
  });

  it("ACTIVE_DELIVERY_STATUSES subset status dikenal, tanpa batal/serah-terima", () => {
    const known = Object.values(DeliveryStatus);
    for (const status of ACTIVE_DELIVERY_STATUSES) {
      expect(known).toContain(status);
    }
    expect(ACTIVE_DELIVERY_STATUSES).toContain("ARRIVED_AT_ROOM");
    expect(ACTIVE_DELIVERY_STATUSES).not.toContain("HANDOVER_CONFIRMED");
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

  it("monitoring hanya melihat pengantaran yang sudah dikirim ke robot", () => {
    expect(MONITORING_ACTIVE_STATUSES).not.toContain("DELIVERY_REQUESTED");
    expect(MONITORING_ACTIVE_STATUSES).toContain("PENDING_INTEGRATION");
    expect(isMonitoringVisible("DELIVERY_REQUESTED", false)).toBe(false);
    expect(isMonitoringVisible("CANCELLED", false)).toBe(false); // batal sebelum dikirim
    expect(isMonitoringVisible("CANCELLED", true)).toBe(true);
    expect(isMonitoringVisible("IN_TRANSIT", true)).toBe(true);
  });
});

describe("NOT_COLLECTED (obat tidak diambil)", () => {
  it("terminal: tidak aktif, bukan sumber transisi, tetap terlihat monitoring", () => {
    expect(ACTIVE_DELIVERY_STATUSES).not.toContain("NOT_COLLECTED");
    expect(DELIVERY_TRANSITIONS.NOT_COLLECTED).toBeUndefined();
    expect(isMonitoringVisible("NOT_COLLECTED", true)).toBe(true);
  });
  it("hanya dicapai dari ARRIVED_AT_ROOM", () => {
    for (const [from, targets] of Object.entries(DELIVERY_TRANSITIONS)) {
      expect((targets ?? []).includes("NOT_COLLECTED")).toBe(from === "ARRIVED_AT_ROOM");
    }
  });
  it("berlabel operasional", () => {
    expect(DELIVERY_STATUS_LABELS.NOT_COLLECTED).toBe("Obat Tidak Diambil");
  });
});
