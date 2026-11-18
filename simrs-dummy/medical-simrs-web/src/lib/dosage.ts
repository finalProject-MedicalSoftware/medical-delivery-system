/**
 * Aturan pakai TERSTRUKTUR (dibaca HMI robot untuk animasi) dan teks turunannya.
 * Teks `instructions` tetap disimpan (kompatibel dengan konsumen lama) tetapi dibuat
 * dari field ini, bukan diketik bebas.
 */

export const MEAL_TIMING_LABELS = {
  ANYTIME: "Kapan saja",
  BEFORE_MEAL: "Sebelum makan",
  AFTER_MEAL: "Sesudah makan",
  WITH_MEAL: "Bersama makan",
} as const;

export const ROUTE_LABELS = {
  ORAL: "Diminum",
  CHEW: "Dikunyah",
  DISSOLVE: "Dilarutkan",
  DROPS: "Diteteskan",
  TOPICAL: "Dioleskan",
  INHALE: "Dihirup",
  INJECTION: "Disuntik (oleh perawat)",
} as const;

const ROUTE_VERB: Record<keyof typeof ROUTE_LABELS, string> = {
  ORAL: "Minum",
  CHEW: "Kunyah",
  DISSOLVE: "Larutkan",
  DROPS: "Teteskan",
  TOPICAL: "Oleskan",
  INHALE: "Hirup",
  INJECTION: "Suntikkan (perawat)",
};

export type MealTiming = keyof typeof MEAL_TIMING_LABELS;
export type Route = keyof typeof ROUTE_LABELS;

export interface Dose {
  amount: number; // jumlah per sekali pakai (boleh pecahan: 0,5)
  unit: string; // tablet, kapsul, ml, tetes, ...
  timesPerDay: number; // 1..6
  mealTiming: MealTiming;
  durationDays: number | null;
  route: Route;
  note: string | null;
}

const FRACTIONS: Record<number, string> = { 0.25: "1/4", 0.5: "1/2", 0.75: "3/4" };

/** 0.5 -> "1/2", 1.5 -> "1 1/2", 2.75 -> "2 3/4", 1.2 -> "1,2" */
export function formatAmount(n: number): string {
  const whole = Math.trunc(n);
  const rest = Math.round((n - whole) * 100) / 100;
  if (rest === 0) return String(whole);
  const frac = FRACTIONS[rest];
  if (frac) return whole > 0 ? `${whole} ${frac}` : frac;
  return String(n).replace(".", ",");
}

/** Kalimat aturan pakai untuk disimpan/ditampilkan, mis. "Minum 1 tablet, 3 kali sehari, sesudah makan, selama 5 hari." */
export function buildInstructions(d: Dose): string {
  const parts = [`${ROUTE_VERB[d.route]} ${formatAmount(d.amount)} ${d.unit}`, `${d.timesPerDay} kali sehari`];
  if (d.mealTiming !== "ANYTIME") parts.push(MEAL_TIMING_LABELS[d.mealTiming].toLowerCase());
  if (d.durationDays) parts.push(`selama ${d.durationDays} hari`);
  const note = d.note?.trim();
  return `${parts.join(", ")}.${note ? ` Catatan: ${note}` : ""}`;
}

/** Pesan kesalahan pertama, atau null bila valid. */
export function validateDose(d: Partial<Dose>): string | null {
  if (typeof d.amount !== "number" || !Number.isFinite(d.amount) || d.amount <= 0 || d.amount > 100) return "Jumlah per dosis harus lebih dari 0 dan maksimal 100";
  if (!d.unit || !d.unit.trim()) return "Satuan dosis wajib diisi";
  if (!Number.isInteger(d.timesPerDay) || (d.timesPerDay as number) < 1 || (d.timesPerDay as number) > 6) return "Frekuensi 1 sampai 6 kali sehari";
  if (d.durationDays != null && (!Number.isInteger(d.durationDays) || d.durationDays < 1 || d.durationDays > 90)) return "Lama pemakaian 1 sampai 90 hari";
  if (!d.mealTiming || !(d.mealTiming in MEAL_TIMING_LABELS)) return "Waktu terhadap makan tidak valid";
  if (!d.route || !(d.route in ROUTE_LABELS)) return "Cara pemakaian tidak valid";
  if (d.note && d.note.length > 150) return "Catatan maksimal 150 karakter";
  return null;
}
