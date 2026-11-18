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
      medicine: { select: { code: true, name: true, unit: true, category: true, handling: true } },
    },
  },
};

type ItemRow = {
  quantity: number;
  instructions: string;
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
    handling: i.medicine.handling,
  }));
}
