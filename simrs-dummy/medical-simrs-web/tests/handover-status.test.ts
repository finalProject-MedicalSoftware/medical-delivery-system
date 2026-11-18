import { describe, it, expect } from "vitest";
import { canConfirmHandover } from "@/lib/handover-status";

describe("Aturan konfirmasi serah-terima", () => {
  it("mengizinkan konfirmasi hanya setelah robot tiba", () => {
    expect(canConfirmHandover("ARRIVED_AT_ROOM")).toBe(true);
  });

  it("menolak status yang belum tiba atau sudah selesai", () => {
    expect(canConfirmHandover("IN_TRANSIT")).toBe(false);
    expect(canConfirmHandover("DELIVERY_REQUESTED")).toBe(false);
    expect(canConfirmHandover("PENDING_INTEGRATION")).toBe(false);
    expect(canConfirmHandover("HANDOVER_CONFIRMED")).toBe(false);
    expect(canConfirmHandover("CANCELLED")).toBe(false);
    expect(canConfirmHandover("")).toBe(false);
  });
});
