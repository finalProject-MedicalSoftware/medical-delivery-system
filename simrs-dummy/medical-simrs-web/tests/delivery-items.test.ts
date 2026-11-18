import { describe, it, expect } from "vitest";
import { mapItems } from "@/lib/delivery-items";

describe("mapItems (kontrak items[] untuk robot/HMI)", () => {
  it("memetakan item resep ke bentuk kontrak", () => {
    expect(
      mapItems([
        {
          quantity: 10,
          instructions: "3x1 tablet sesudah makan",
          medicine: { code: "MED-PCM-500", name: "Paracetamol 500 mg", unit: "tablet", category: "Analgesik", handling: "NONE" },
        },
      ])
    ).toEqual([
      {
        medicineCode: "MED-PCM-500",
        name: "Paracetamol 500 mg",
        category: "Analgesik",
        quantity: 10,
        unit: "tablet",
        instructions: "3x1 tablet sesudah makan",
        handling: "NONE",
      },
    ]);
  });

  it("resep tanpa item menghasilkan array kosong, bukan undefined", () => {
    expect(mapItems([])).toEqual([]);
  });
});
