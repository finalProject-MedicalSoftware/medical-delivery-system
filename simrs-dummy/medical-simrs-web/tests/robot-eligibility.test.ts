import { describe, it, expect } from "vitest";
import { robotEligibility } from "@/lib/robot-eligibility";

const d = (robotReason: string | null) => ({ requestCode: "DELIV-1", status: "PENDING_INTEGRATION", robotReason });

describe("robotEligibility", () => {
  it("pasien menular dengan pengantaran terkirim = layak", () => {
    expect(robotEligibility(true, [d(null)])).toEqual({ robotEligible: true, robotReason: null });
  });
  it("tidak menular tapi ada alasan = layak, alasan ikut", () => {
    expect(robotEligibility(false, [d("obat berat")])).toEqual({ robotEligible: true, robotReason: "obat berat" });
  });
  it("tidak menular tanpa alasan = tidak layak", () => {
    expect(robotEligibility(false, [d(null)]).robotEligible).toBe(false);
  });
  it("tanpa pengantaran terkirim = tidak layak, walau menular", () => {
    expect(robotEligibility(true, []).robotEligible).toBe(false);
  });
});
