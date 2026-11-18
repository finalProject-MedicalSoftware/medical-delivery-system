import { describe, it, expect } from "vitest";
import { parseAllergies, findAllergyConflicts, isLowStock } from "@/lib/clinical";

describe("parseAllergies", () => {
  it("memisah koma/baris/titik koma, membuang kosong dan duplikat", () => {
    expect(parseAllergies("Penisilin, latex;\npenisilin ,  ")).toEqual(["Penisilin", "latex"]);
    expect(parseAllergies(null)).toEqual([]);
  });
});

describe("findAllergyConflicts", () => {
  it("menangkap alergi yang menjadi bagian nama obat, tanpa peduli huruf besar", () => {
    expect(findAllergyConflicts(["paracetamol"], [{ name: "Paracetamol 500 mg" }, { name: "Vitamin C" }]))
      .toEqual([{ allergy: "paracetamol", medicine: "Paracetamol 500 mg" }]);
  });
  it("tanpa alergi atau tanpa kecocokan = kosong", () => {
    expect(findAllergyConflicts([], [{ name: "Vitamin C" }])).toEqual([]);
    expect(findAllergyConflicts(["latex"], [{ name: "Vitamin C" }])).toEqual([]);
  });
});

describe("isLowStock", () => {
  it("menipis saat stok <= ambang", () => {
    expect(isLowStock(20, 20)).toBe(true);
    expect(isLowStock(21, 20)).toBe(false);
  });
});
