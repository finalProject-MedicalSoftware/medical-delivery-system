/** Aturan klinis kecil yang dipakai UI, server action, dan kontrak monitoring. */

export const PRIORITY_LABELS = { ROUTINE: "Rutin", URGENT: "Mendesak", STAT: "STAT (segera)" } as const;
export const HANDLING_LABELS = {
  NONE: "Biasa",
  COLD_CHAIN: "Rantai dingin",
  CONTROLLED: "Narkotika/psikotropika",
  HIGH_ALERT: "Obat kewaspadaan tinggi",
} as const;

/** "penisilin, Paracetamol\nlatex" -> ["penisilin","Paracetamol","latex"] (tanpa duplikat, tanpa kosong). */
export function parseAllergies(text: string | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of (text ?? "").split(/[,\n;]/)) {
    const t = part.trim();
    if (t && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      out.push(t);
    }
  }
  return out;
}

/**
 * Alergi yang cocok dengan nama obat (cocok sebagian, tanpa peduli huruf besar).
 * shortcut: hanya pencocokan nama; tidak mengenal golongan obat (mis. alergi
 * "penisilin" tidak menangkap "amoxicillin"). Ganti dengan tabel golongan
 * bila dipakai di luar demo.
 */
export function findAllergyConflicts(
  allergies: string[],
  medicines: { name: string }[]
): { allergy: string; medicine: string }[] {
  const hits: { allergy: string; medicine: string }[] = [];
  for (const a of allergies) {
    const al = a.toLowerCase();
    for (const m of medicines) {
      const mn = m.name.toLowerCase();
      if (mn.includes(al) || al.includes(mn)) hits.push({ allergy: a, medicine: m.name });
    }
  }
  return hits;
}

export function isLowStock(stock: number, minStock: number): boolean {
  return stock <= minStock;
}
