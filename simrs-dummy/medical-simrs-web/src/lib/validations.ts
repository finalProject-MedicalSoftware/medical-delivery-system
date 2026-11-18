import { z } from "zod";
import { validateDose } from "@/lib/dosage";

export const patientSchema = z.object({
  mrn: z.string().min(3, "MRN wajib diisi minimal 3 karakter"),
  fullName: z.string().min(2, "Nama lengkap wajib diisi"),
  dateOfBirth: z.string().or(z.date()),
  gender: z.enum(["L", "P"], { error: () => "Gender harus L atau P" }),
  roomCode: z.string().optional().nullable(),
  bedId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  diagnosis: z.string().max(200, "Diagnosis maksimal 200 karakter").optional().nullable(),
  isInfectious: z.boolean().default(false),
  allergies: z.array(z.string().max(60, "Nama alergi maksimal 60 karakter")).max(20, "Maksimal 20 alergi").default([]),
});

export const roomSchema = z.object({
  wardId: z.string().min(1, "Bangsal wajib dipilih"),
  roomCode: z
    .string()
    .min(3, "Kode ruang wajib diisi")
    .regex(/^[A-Z0-9\-_]+$/, "Kode ruang hanya boleh huruf kapital, angka, strip, dan underscore"),
  name: z.string().min(2, "Nama ruang wajib diisi"),
});

export const wardSchema = z.object({
  code: z
    .string()
    .min(3, "Kode bangsal wajib diisi")
    .regex(/^[A-Z0-9\-_]+$/, "Kode bangsal hanya boleh huruf kapital, angka, strip, dan underscore"),
  name: z.string().min(2, "Nama bangsal wajib diisi"),
  floor: z.coerce.number().int().min(1, "Lantai minimal 1").max(50, "Lantai maksimal 50"),
});

export const medicineSchema = z.object({
  code: z.string().min(3, "Kode obat wajib diisi"),
  name: z.string().min(2, "Nama obat wajib diisi"),
  unit: z.string().min(1, "Satuan obat wajib diisi"),
  category: z.string().min(1, "Kategori obat wajib diisi"),
  stock: z.number().int().nonnegative("Stok tidak boleh negatif").default(0),
  minStock: z.number().int().nonnegative("Ambang stok tidak boleh negatif").default(20),
  handling: z.enum(["NONE", "COLD_CHAIN", "CONTROLLED", "HIGH_ALERT"]).default("NONE"),
});

export const prescriptionItemSchema = z.object({
  medicineId: z.string().min(1, "Obat wajib dipilih"),
  quantity: z.number().int().positive("Kuantitas minimal 1"),
  // Aturan pakai terstruktur; teks `instructions` dibuat server dari field ini (lib/dosage.ts).
  doseAmount: z.number(),
  doseUnit: z.string(),
  timesPerDay: z.number(),
  mealTiming: z.enum(["ANYTIME", "BEFORE_MEAL", "AFTER_MEAL", "WITH_MEAL"]).default("ANYTIME"),
  durationDays: z.number().nullable().optional(),
  adminRoute: z.enum(["ORAL", "CHEW", "DISSOLVE", "DROPS", "TOPICAL", "INHALE", "INJECTION"]).default("ORAL"),
  doseNote: z.string().nullable().optional(),
}).superRefine((item, ctx) => {
  const err = validateDose({
    amount: item.doseAmount, unit: item.doseUnit, timesPerDay: item.timesPerDay, mealTiming: item.mealTiming,
    durationDays: item.durationDays ?? null, route: item.adminRoute, note: item.doseNote ?? null,
  });
  if (err) ctx.addIssue({ code: "custom", message: err });
});

// Jadwal minum (kontrak web-monitoring-integration.md §1.2): "HH:mm",
// maks 6 slot; repeatMode default DAILY, INTERVAL menuntut intervalDays 1..30.
export const createPrescriptionSchema = z
  .object({
    patientId: z.string().min(1, "Pasien wajib dipilih"),
    notes: z.string().optional().nullable(),
    items: z.array(prescriptionItemSchema).min(1, "Minimal pilih 1 item obat"),
    doseTimes: z
      .array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Format jam harus HH:mm"))
      .max(6, "Maksimal 6 jadwal minum")
      .default([]),
    priority: z.enum(["ROUTINE", "URGENT", "STAT"]).default("ROUTINE"),
    repeatMode: z.enum(["DAILY", "INTERVAL"]).default("DAILY"),
    intervalDays: z.coerce
      .number()
      .int("Interval harus bilangan bulat")
      .min(1, "Interval minimal 1 hari")
      .max(30, "Interval maksimal 30 hari")
      .optional(),
  })
  .refine((d) => d.repeatMode !== "INTERVAL" || d.intervalDays !== undefined, {
    message: "Interval hari wajib diisi bila mode INTERVAL",
    path: ["intervalDays"],
  });

export const verifyPrescriptionSchema = z.object({
  action: z.enum(["VERIFY", "REJECT"]),
  rejectionReason: z.string().optional(),
}).refine(
  (data) => {
    if (data.action === "REJECT" && (!data.rejectionReason || data.rejectionReason.trim().length === 0)) {
      return false;
    }
    return true;
  },
  {
    message: "Alasan penolakan wajib dicatat jika resep ditolak",
    path: ["rejectionReason"],
  }
);

export const createDeliveryRequestSchema = z.object({
  robotReason: z.string().max(300, "Alasan maksimal 300 karakter").optional().nullable(),
  prescriptionId: z.string().min(1, "Resep wajib dipilih"),
  roomCode: z.string().min(1, "Kode ruang tujuan wajib diisi"),
  notes: z.string().optional().nullable(),
});
