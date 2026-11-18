import { describe, it, expect } from "vitest";
import { buildInstructions, formatAmount, validateDose, type Dose } from "@/lib/dosage";

const base: Dose = { amount: 1, unit: "tablet", timesPerDay: 3, mealTiming: "AFTER_MEAL", durationDays: 5, route: "ORAL", note: null };

describe("formatAmount", () => {
  it("pecahan umum dan campuran", () => {
    expect(formatAmount(1)).toBe("1");
    expect(formatAmount(0.5)).toBe("1/2");
    expect(formatAmount(0.25)).toBe("1/4");
    expect(formatAmount(1.5)).toBe("1 1/2");
    expect(formatAmount(2.75)).toBe("2 3/4");
    expect(formatAmount(1.2)).toBe("1,2");
  });
});

describe("buildInstructions", () => {
  it("lengkap: cara, jumlah, frekuensi, waktu makan, lama", () => {
    expect(buildInstructions(base)).toBe("Minum 1 tablet, 3 kali sehari, sesudah makan, selama 5 hari.");
  });
  it("tanpa waktu makan dan lama, dengan catatan", () => {
    expect(buildInstructions({ ...base, mealTiming: "ANYTIME", durationDays: null, note: "bila demam" }))
      .toBe("Minum 1 tablet, 3 kali sehari. Catatan: bila demam");
  });
  it("cara lain memakai kata kerja yang sesuai", () => {
    expect(buildInstructions({ ...base, route: "DROPS", amount: 2, unit: "tetes", mealTiming: "ANYTIME", durationDays: null }))
      .toBe("Teteskan 2 tetes, 3 kali sehari.");
  });
});

describe("validateDose", () => {
  it("valid = null", () => expect(validateDose(base)).toBeNull());
  it("menolak jumlah nol/negatif/terlalu besar, frekuensi di luar 1..6, lama 0", () => {
    expect(validateDose({ ...base, amount: 0 })).toMatch(/Jumlah/);
    expect(validateDose({ ...base, amount: 101 })).toMatch(/Jumlah/);
    expect(validateDose({ ...base, timesPerDay: 0 })).toMatch(/Frekuensi/);
    expect(validateDose({ ...base, timesPerDay: 7 })).toMatch(/Frekuensi/);
    expect(validateDose({ ...base, durationDays: 0 })).toMatch(/Lama/);
    expect(validateDose({ ...base, unit: " " })).toMatch(/Satuan/);
  });
});
