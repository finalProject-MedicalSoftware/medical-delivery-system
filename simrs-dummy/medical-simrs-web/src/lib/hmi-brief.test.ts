import { describe, it, expect } from "vitest";
import { hmiBrief, initials, mrnHash } from "@/lib/hmi-brief";
import { signScheduleToken, verifyScheduleToken } from "@/lib/schedule-token";
import { signScanToken } from "@/lib/qr-token";

describe("hmi-brief", () => {
  it("mrnHash = SHA-256 hex dari MRN (spasi tepi diabaikan)", () => {
    expect(mrnHash("SYN-MRN-001")).toMatch(/^[0-9a-f]{64}$/);
    expect(mrnHash(" SYN-MRN-001 ")).toBe(mrnHash("SYN-MRN-001"));
    expect(mrnHash("SYN-MRN-002")).not.toBe(mrnHash("SYN-MRN-001"));
  });
  it("inisial maksimal 3 huruf", () => {
    expect(initials("budi santoso")).toBe("B.S.");
    expect(initials("Siti Nur Aisyah Putri")).toBe("S.N.A.");
  });
  it("brief tidak membawa nama lengkap atau MRN mentah", () => {
    process.env.QR_BASE_URL = "https://simrs.test";
    const b = hmiBrief({ mrn: "SYN-MRN-001", fullName: "Budi Santoso", allergies: [" Amoxicillin ", ""] }, "DELIV-1");
    const json = JSON.stringify(b);
    expect(json).not.toContain("Budi");
    expect(json).not.toContain("SYN-MRN-001");
    expect(b.patient.allergies).toEqual(["Amoxicillin"]);
    expect(b.scheduleUrl).toMatch(/^https:\/\/simrs\.test\/jadwal\/DELIV-1\?t=\d+\./);
  });
});

describe("schedule-token", () => {
  it("valid untuk kode yang sama, tolak kode lain/kedaluwarsa", () => {
    const t = signScheduleToken("DELIV-1", 60);
    expect(verifyScheduleToken("DELIV-1", t)).toBe(true);
    expect(verifyScheduleToken("DELIV-2", t)).toBe(false);
    expect(verifyScheduleToken("DELIV-1", t, Date.now() + 61_000)).toBe(false);
    expect(verifyScheduleToken("DELIV-1", undefined)).toBe(false);
  });
  it("token gelang tidak bisa dipakai membuka jadwal (prefiks berbeda)", () => {
    expect(verifyScheduleToken("DELIV-1", signScanToken("DELIV-1"))).toBe(false);
  });
});
