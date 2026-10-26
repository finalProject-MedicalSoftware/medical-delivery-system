"use server";

import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/auth";
import { PERMISSION_CODES } from "@/lib/rbac";
import { patientSchema } from "@/lib/validations";
import { createPatient } from "@/lib/master-data";
import { claimBedForPatient, releaseBedIfUnused } from "@/lib/bed-availability";
import { revalidatePath } from "next/cache";

/**
 * Ubah error teknis jadi pesan ramah untuk UI.
 * P2003 pada audit berarti actorId sesi tidak ada di DB (sesi basi
 * setelah reset/seed). UNAUTHORIZED berarti sesi hilang atau user
 * dinonaktifkan. Keduanya pulih dengan logout lalu login ulang.
 */
function patientActionError(e: unknown, fallback: string): string {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
    return "Sesi login tidak valid (data akun berubah setelah reset). Silakan logout lalu login ulang.";
  }
  if (e instanceof Error) {
    if (e.message.startsWith("UNAUTHORIZED")) {
      return "Sesi Anda kedaluwarsa atau akun berubah. Silakan logout lalu login ulang.";
    }
    return e.message;
  }
  return fallback;
}

export async function createPatientAction(
  formData: FormData
): Promise<{ ok: boolean; to?: string; error?: string }> {
  let actor;
  try {
    actor = await requirePermission(PERMISSION_CODES.MASTER_MANAGE);
  } catch (e) {
    return { ok: false, error: patientActionError(e, "Gagal menambah pasien") };
  }

  const raw = {
    mrn: ((formData.get("mrn") as string) || "").trim().toUpperCase(),
    fullName: ((formData.get("fullName") as string) || "").trim(),
    dateOfBirth: formData.get("dateOfBirth") as string,
    gender: formData.get("gender") as string,
    roomCode: (formData.get("roomCode") as string) || null,
    bedId: (formData.get("bedId") as string) || null,
    notes: (formData.get("notes") as string) || null,
    diagnosis: ((formData.get("diagnosis") as string) || "").trim() || null,
    isInfectious: formData.get("isInfectious") === "1",
  };

  const parsed = patientSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  let patientId: string;
  try {
    const patient = await createPatient(parsed.data, actor.userId);
    patientId = patient.id;
  } catch (e) {
    return { ok: false, error: patientActionError(e, "Gagal menambah pasien") };
  }

  // Tanpa ruang rawat: arahkan ke detail agar alert + CTA buat resep terlihat.
  revalidatePath("/pasien");
  revalidatePath("/bangsal");
  return {
    ok: true,
    to: parsed.data.roomCode ? "/pasien" : `/pasien/${patientId}`,
  };
}

export async function updatePatientAction(
  formData: FormData
): Promise<{ ok: boolean; to?: string; error?: string }> {
  let actor;
  try {
    actor = await requirePermission(PERMISSION_CODES.MASTER_MANAGE);
  } catch (e) {
    return { ok: false, error: patientActionError(e, "Gagal mengubah pasien") };
  }

  const patientId = formData.get("patientId") as string;
  if (!patientId) return { ok: false, error: "ID pasien tidak valid" };

  const raw = {
    mrn: ((formData.get("mrn") as string) || "").trim().toUpperCase(),
    fullName: ((formData.get("fullName") as string) || "").trim(),
    dateOfBirth: formData.get("dateOfBirth") as string,
    gender: formData.get("gender") as string,
    roomCode: (formData.get("roomCode") as string) || null,
    bedId: (formData.get("bedId") as string) || null,
    notes: (formData.get("notes") as string) || null,
    diagnosis: ((formData.get("diagnosis") as string) || "").trim() || null,
    isInfectious: formData.get("isInfectious") === "1",
  };

  const parsed = patientSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const existing = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!existing) return { ok: false, error: "Pasien tidak ditemukan" };

  const mrnTaken = await prisma.patient.findFirst({
    where: { mrn: parsed.data.mrn, NOT: { id: patientId } },
    select: { id: true },
  });
  if (mrnTaken) {
    return { ok: false, error: `Nomor MRN '${parsed.data.mrn}' sudah dipakai pasien lain` };
  }

  // Tanpa ruang tidak ada bed. Ganti ruang tanpa pilih bed melepas bed lama.
  const newBedId = parsed.data.roomCode ? (parsed.data.bedId ?? null) : null;
  if (parsed.data.roomCode && !newBedId) {
    return { ok: false, error: `Pilih bed untuk ruang ${parsed.data.roomCode}. Bila penuh, pilih ruang lain.` };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.patient.update({
        where: { id: patientId },
        data: {
          mrn: parsed.data.mrn,
          fullName: parsed.data.fullName,
          dateOfBirth: new Date(parsed.data.dateOfBirth),
          gender: parsed.data.gender,
          roomCode: parsed.data.roomCode,
          bedId: newBedId,
          notes: parsed.data.notes,
          diagnosis: parsed.data.diagnosis,
          isInfectious: parsed.data.isInfectious,
        },
      });

      if (newBedId && parsed.data.roomCode) {
        await claimBedForPatient(tx, {
          patientId,
          roomCode: parsed.data.roomCode,
          bedId: newBedId,
          previousBedId: existing.bedId,
        });
      } else if (existing.bedId) {
        await releaseBedIfUnused(tx, existing.bedId, patientId);
      }

      await tx.auditLog.create({
        data: {
          entityType: "PATIENT",
          entityId: patientId,
          action: "UPDATE_PATIENT",
          actorId: actor.userId,
          details: { mrn: parsed.data.mrn, fullName: parsed.data.fullName },
        },
      });
    });
  } catch (e) {
    return { ok: false, error: patientActionError(e, "Gagal mengubah pasien") };
  }

  revalidatePath("/pasien");
  revalidatePath("/bangsal");
  return { ok: true, to: `/pasien/${patientId}` };
}

export async function dischargePatientAction(
  patientId: string,
  note?: string
): Promise<{ success: boolean; error?: string }> {
  let actor;
  try {
    actor = await requirePermission(PERMISSION_CODES.MASTER_MANAGE);
  } catch (e) {
    return { success: false, error: patientActionError(e, "Gagal menyelesaikan perawatan") };
  }

  const existing = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!existing) return { success: false, error: "Pasien tidak ditemukan" };
  if (existing.dischargedAt) {
    return { success: false, error: "Pasien sudah selesai rawat inap" };
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Pulang otomatis membebaskan bed agar bisa dipakai pasien lain.
      // roomCode dipertahankan sebagai riwayat ruang perawatan terakhir.
      await tx.patient.update({
        where: { id: patientId },
        data: { dischargedAt: new Date(), dischargeNote: note?.trim() || null, bedId: null },
      });

      if (existing.bedId) {
        await releaseBedIfUnused(tx, existing.bedId, patientId);
      }

      await tx.auditLog.create({
        data: {
          entityType: "PATIENT",
          entityId: patientId,
          action: "DISCHARGE_PATIENT",
          actorId: actor.userId,
          details: { mrn: existing.mrn, roomCode: existing.roomCode },
        },
      });
    });
  } catch (e) {
    return { success: false, error: patientActionError(e, "Gagal menyelesaikan perawatan") };
  }

  revalidatePath(`/pasien/${patientId}`);
  revalidatePath("/pasien");
  revalidatePath("/bangsal");
  return { success: true };
}

export async function readmitPatientAction(
  patientId: string
): Promise<{ success: boolean; error?: string }> {
  let actor;
  try {
    actor = await requirePermission(PERMISSION_CODES.MASTER_MANAGE);
  } catch (e) {
    return { success: false, error: patientActionError(e, "Gagal merawat kembali") };
  }

  const existing = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!existing) return { success: false, error: "Pasien tidak ditemukan" };
  if (!existing.dischargedAt) {
    return { success: false, error: "Pasien masih dalam perawatan" };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.patient.update({
        where: { id: patientId },
        data: { dischargedAt: null, dischargeNote: null },
      });

      await tx.auditLog.create({
        data: {
          entityType: "PATIENT",
          entityId: patientId,
          action: "READMIT_PATIENT",
          actorId: actor.userId,
          details: { mrn: existing.mrn },
        },
      });
    });
  } catch (e) {
    return { success: false, error: patientActionError(e, "Gagal merawat kembali") };
  }

  revalidatePath(`/pasien/${patientId}`);
  revalidatePath("/pasien");
  return { success: true };
}
