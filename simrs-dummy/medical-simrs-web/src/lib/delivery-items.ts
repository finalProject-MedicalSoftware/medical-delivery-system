/**
 * Item obat resep untuk konsumen monitoring/robot/HMI (kontrak aditif).
 * Satu sumber bentuk `items[]` supaya active-deliveries, snapshot, dan
 * patient/{mrn} tidak berbeda.
 */
export const ITEMS_SELECT = {
  items: {
    orderBy: { createdAt: "asc" as const },
    select: {
      quantity: true,
      instructions: true,
      doseAmount: true,
      doseUnit: true,
      timesPerDay: true,
      mealTiming: true,
      durationDays: true,
      adminRoute: true,
      doseNote: true,
      medicine: { select: { code: true, name: true, unit: true, category: true, handling: true } },
    },
  },
};

type ItemRow = {
  quantity: number;
  instructions: string;
  doseAmount: number | null;
  doseUnit: string | null;
  timesPerDay: number | null;
  mealTiming: string;
  durationDays: number | null;
  adminRoute: string;
  doseNote: string | null;
  medicine: { code: string; name: string; unit: string; category: string; handling: string };
};

export function mapItems(items: ItemRow[]) {
  return items.map((i) => ({
    medicineCode: i.medicine.code,
    name: i.medicine.name,
    category: i.medicine.category,
    quantity: i.quantity,
    unit: i.medicine.unit,
    instructions: i.instructions,
    // Terstruktur untuk animasi HMI; null pada resep lama (pakai `instructions`).
    dose: i.doseAmount == null || i.timesPerDay == null
      ? null
      : {
          amount: i.doseAmount,
          unit: i.doseUnit ?? i.medicine.unit,
          timesPerDay: i.timesPerDay,
          mealTiming: i.mealTiming,
          durationDays: i.durationDays,
          route: i.adminRoute,
          note: i.doseNote,
        },
    handling: i.medicine.handling,
  }));
}
