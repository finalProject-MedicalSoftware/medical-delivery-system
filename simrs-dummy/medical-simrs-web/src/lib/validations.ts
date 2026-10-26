import { z } from "zod";

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
});

export const prescriptionItemSchema = z.object({
  medicineId: z.string().min(1, "Obat wajib dipilih"),
  quantity: z.number().int().positive("Kuantitas minimal 1"),
  instructions: z.string().min(3, "Instruksi aturan pakai wajib diisi"),
});

export const createPrescriptionSchema = z.object({
  patientId: z.string().min(1, "Pasien wajib dipilih"),
  notes: z.string().optional().nullable(),
  items: z.array(prescriptionItemSchema).min(1, "Minimal pilih 1 item obat"),
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
  prescriptionId: z.string().min(1, "Resep wajib dipilih"),
  roomCode: z.string().min(1, "Kode ruang tujuan wajib diisi"),
  notes: z.string().optional().nullable(),
});
