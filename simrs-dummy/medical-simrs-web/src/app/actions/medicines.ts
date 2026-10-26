"use server";

import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { PERMISSION_CODES } from "@/lib/rbac";
import { medicineSchema } from "@/lib/validations";
import { revalidatePath } from "next/cache";

function parseMedicineForm(formData: FormData) {
  return {
    code: ((formData.get("code") as string) || "").trim().toUpperCase(),
    name: ((formData.get("name") as string) || "").trim(),
    unit: ((formData.get("unit") as string) || "").trim(),
    category: ((formData.get("category") as string) || "").trim(),
    stock: Number(formData.get("stock")),
  };
}

export async function createMedicineAction(
  formData: FormData
): Promise<{ ok: boolean; to?: string; error?: string }> {
  const actor = await requirePermission(PERMISSION_CODES.MASTER_MANAGE);

  const parsed = medicineSchema.safeParse(parseMedicineForm(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const taken = await prisma.medicine.findUnique({ where: { code: parsed.data.code } });
  if (taken) {
    return { ok: false, error: `Kode obat '${parsed.data.code}' sudah terdaftar` };
  }

  await prisma.$transaction(async (tx) => {
    const med = await tx.medicine.create({
      data: {
        code: parsed.data.code,
        name: parsed.data.name,
        unit: parsed.data.unit,
        category: parsed.data.category,
        stock: parsed.data.stock,
        isActive: true,
      },
    });
    await tx.auditLog.create({
      data: {
        entityType: "MASTER_DATA",
        entityId: med.id,
        action: "CREATE_MEDICINE",
        actorId: actor.userId,
        details: { code: med.code, name: med.name },
      },
    });
  });

  revalidatePath("/obat");
  return { ok: true, to: "/obat" };
}

export async function updateMedicineAction(
  formData: FormData
): Promise<{ ok: boolean; to?: string; error?: string }> {
  const actor = await requirePermission(PERMISSION_CODES.MASTER_MANAGE);

  const medicineId = formData.get("medicineId") as string;
  if (!medicineId) return { ok: false, error: "ID obat tidak valid" };

  const parsed = medicineSchema.safeParse(parseMedicineForm(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const existing = await prisma.medicine.findUnique({ where: { id: medicineId } });
  if (!existing) return { ok: false, error: "Obat tidak ditemukan" };

  const taken = await prisma.medicine.findFirst({
    where: { code: parsed.data.code, NOT: { id: medicineId } },
    select: { id: true },
  });
  if (taken) {
    return { ok: false, error: `Kode obat '${parsed.data.code}' sudah dipakai obat lain` };
  }

  await prisma.$transaction(async (tx) => {
    await tx.medicine.update({
      where: { id: medicineId },
      data: {
        code: parsed.data.code,
        name: parsed.data.name,
        unit: parsed.data.unit,
        category: parsed.data.category,
        stock: parsed.data.stock,
      },
    });

    await tx.auditLog.create({
      data: {
        entityType: "MASTER_DATA",
        entityId: medicineId,
        action: "UPDATE_MEDICINE",
        actorId: actor.userId,
        details: { code: parsed.data.code, name: parsed.data.name },
      },
    });
  });

  revalidatePath("/obat");
  return { ok: true, to: "/obat" };
}

export async function toggleMedicineAction(
  medicineId: string
): Promise<{ success: boolean; error?: string }> {
  const actor = await requirePermission(PERMISSION_CODES.MASTER_MANAGE);

  const existing = await prisma.medicine.findUnique({ where: { id: medicineId } });
  if (!existing) return { success: false, error: "Obat tidak ditemukan" };

  await prisma.$transaction(async (tx) => {
    await tx.medicine.update({
      where: { id: medicineId },
      data: { isActive: !existing.isActive },
    });

    await tx.auditLog.create({
      data: {
        entityType: "MASTER_DATA",
        entityId: medicineId,
        action: existing.isActive ? "DEACTIVATE_MEDICINE" : "ACTIVATE_MEDICINE",
        actorId: actor.userId,
        details: { code: existing.code },
      },
    });
  });

  revalidatePath("/obat");
  return { success: true };
}
