"use server";

import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { PERMISSION_CODES } from "@/lib/rbac";
import { createPrescriptionSchema, verifyPrescriptionSchema } from "@/lib/validations";
import { revalidatePath } from "next/cache";
import { PrescriptionStatus } from "@prisma/client";

// Generate sequential prescription code
async function generatePrescriptionCode(): Promise<string> {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const count = await prisma.prescription.count({
    where: { code: { startsWith: `RX-${today}` } },
  });
  return `RX-${today}-${String(count + 1).padStart(4, "0")}`;
}

export async function createPrescriptionAction(
  formData: FormData
): Promise<{ ok: boolean; to?: string; error?: string }> {
  const actor = await requirePermission(PERMISSION_CODES.PRESCRIPTION_CREATE);

  const raw = {
    patientId: formData.get("patientId") as string,
    notes: (formData.get("notes") as string) || null,
    items: JSON.parse((formData.get("items") as string) || "[]"),
  };

  const parsed = createPrescriptionSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const code = await generatePrescriptionCode();

  await prisma.$transaction(async (tx) => {
    const rx = await tx.prescription.create({
      data: {
        code,
        patientId: parsed.data.patientId,
        doctorId: actor.userId,
        notes: parsed.data.notes,
        status: "SUBMITTED",
        items: {
          create: parsed.data.items.map((item) => ({
            medicineId: item.medicineId,
            quantity: item.quantity,
            instructions: item.instructions,
          })),
        },
      },
    });

    await tx.auditLog.create({
      data: {
        entityType: "PRESCRIPTION",
        entityId: rx.id,
        action: "CREATE_PRESCRIPTION",
        actorId: actor.userId,
        details: { code: rx.code, patientId: rx.patientId, itemCount: parsed.data.items.length },
      },
    });
  });

  revalidatePath("/resep");
  return { ok: true, to: "/resep" };
}

// Valid transitions enforced server-side
const ALLOWED_TRANSITIONS: Partial<Record<PrescriptionStatus, PrescriptionStatus[]>> = {
  DRAFT: ["SUBMITTED", "CANCELLED"],
  SUBMITTED: ["VERIFIED", "REJECTED", "CANCELLED"],
  VERIFIED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY_FOR_DELIVERY", "CANCELLED"],
};

export async function updatePrescriptionStatusAction(
  prescriptionId: string,
  newStatus: PrescriptionStatus,
  opts?: { rejectionReason?: string; actorId?: string }
): Promise<{ success: boolean; error?: string }> {
  // Determine required permission
  const permMap: Partial<Record<PrescriptionStatus, string>> = {
    SUBMITTED: PERMISSION_CODES.PRESCRIPTION_CREATE,
    VERIFIED: PERMISSION_CODES.PRESCRIPTION_VERIFY,
    REJECTED: PERMISSION_CODES.PRESCRIPTION_VERIFY,
    PREPARING: PERMISSION_CODES.PRESCRIPTION_PREPARE,
    READY_FOR_DELIVERY: PERMISSION_CODES.PRESCRIPTION_PREPARE,
    CANCELLED: PERMISSION_CODES.PRESCRIPTION_CREATE,
  };

  const requiredPerm = permMap[newStatus] ?? PERMISSION_CODES.PRESCRIPTION_READ;
  const actor = await requirePermission(requiredPerm);

  const rx = await prisma.prescription.findUnique({ where: { id: prescriptionId } });
  if (!rx) return { success: false, error: "Resep tidak ditemukan" };

  const allowed = ALLOWED_TRANSITIONS[rx.status] ?? [];
  if (!allowed.includes(newStatus)) {
    return {
      success: false,
      error: `Transisi ${rx.status} → ${newStatus} tidak diperbolehkan`,
    };
  }

  if (newStatus === "REJECTED" && !opts?.rejectionReason?.trim()) {
    return { success: false, error: "Alasan penolakan wajib dicatat" };
  }

  // Stok obat dikurangi saat resep mulai disiapkan (PREPARING -> READY_FOR_DELIVERY)
  const dispenses = newStatus === "READY_FOR_DELIVERY"
    ? await prisma.prescriptionItem.findMany({ where: { prescriptionId }, include: { medicine: true } })
    : [];

  try {
    await prisma.$transaction(async (tx) => {
      for (const item of dispenses) {
        const res = await tx.medicine.updateMany({
          where: { id: item.medicineId, stock: { gte: item.quantity } },
          data: { stock: { decrement: item.quantity } },
        });
        if (res.count === 0) {
          throw new Error(`Stok obat ${item.medicine.name} tidak mencukupi (sisa ${item.medicine.stock}, dibutuhkan ${item.quantity})`);
        }
      }

      await tx.prescription.update({
        where: { id: prescriptionId },
        data: {
          status: newStatus,
        ...(newStatus === "VERIFIED" || newStatus === "REJECTED"
          ? { verifiedById: actor.userId, verifiedAt: new Date() }
          : {}),
        ...(newStatus === "REJECTED" ? { rejectionReason: opts?.rejectionReason } : {}),
      },
      });

      await tx.auditLog.create({
        data: {
          entityType: "PRESCRIPTION",
          entityId: prescriptionId,
          action: `STATUS_CHANGE`,
          actorId: actor.userId,
          details: { from: rx.status, to: newStatus, rejectionReason: opts?.rejectionReason },
        },
      });
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gagal memperbarui status resep";
    if (msg.startsWith("Stok obat")) {
      return { success: false, error: msg };
    }
    throw e;
  }

  revalidatePath(`/resep/${prescriptionId}`);
  revalidatePath("/resep");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function verifyPrescriptionAction(
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const prescriptionId = formData.get("prescriptionId") as string;
  const raw = {
    action: formData.get("action") as string,
    rejectionReason: (formData.get("rejectionReason") as string) || undefined,
  };

  const parsed = verifyPrescriptionSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const newStatus: PrescriptionStatus =
    parsed.data.action === "VERIFY" ? "VERIFIED" : "REJECTED";

  const result = await updatePrescriptionStatusAction(prescriptionId, newStatus, {
    rejectionReason: parsed.data.rejectionReason,
  });

  if (!result.success) return { ok: false, error: result.error };
  revalidatePath(`/resep/${prescriptionId}`);
  revalidatePath("/resep");
  return { ok: true };
}
