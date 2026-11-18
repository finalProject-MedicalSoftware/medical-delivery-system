import { describe, it, expect } from "vitest";
import { mapItems } from "@/lib/delivery-items";

const medicine = { code: "MED-PCM-500", name: "Paracetamol 500 mg", unit: "tablet", category: "Analgesik", handling: "NONE" };
const legacy = { quantity: 10, instructions: "3x1 tablet sesudah makan", medicine,
  doseAmount: null, doseUnit: null, timesPerDay: null, mealTiming: "ANYTIME", durationDays: null, adminRoute: "ORAL", doseNote: null };

describe("mapItems (kontrak items[] untuk robot/HMI)", () => {
  it("resep lama (tanpa aturan terstruktur): dose null, teks instructions tetap", () => {
    expect(mapItems([legacy])).toEqual([
      {
        medicineCode: "MED-PCM-500", name: "Paracetamol 500 mg", category: "Analgesik", quantity: 10, unit: "tablet",
        instructions: "3x1 tablet sesudah makan", dose: null, handling: "NONE",
      },
    ]);
  });

  it("resep baru: dose terstruktur untuk animasi HMI", () => {
    const [item] = mapItems([{ ...legacy, doseAmount: 0.5, doseUnit: "tablet", timesPerDay: 3, mealTiming: "AFTER_MEAL", durationDays: 5, adminRoute: "CHEW", doseNote: "bila demam" }]);
    expect(item.dose).toEqual({ amount: 0.5, unit: "tablet", timesPerDay: 3, mealTiming: "AFTER_MEAL", durationDays: 5, route: "CHEW", note: "bila demam" });
  });

  it("satuan dosis kosong memakai satuan obat", () => {
    const [item] = mapItems([{ ...legacy, doseAmount: 1, doseUnit: null, timesPerDay: 2 }]);
    expect(item.dose?.unit).toBe("tablet");
  });

  it("resep tanpa item menghasilkan array kosong, bukan undefined", () => {
    expect(mapItems([])).toEqual([]);
  });
});
