"use server";

import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { PERMISSION_CODES } from "@/lib/rbac";
import { wardSchema, roomSchema } from "@/lib/validations";
import { revalidatePath } from "next/cache";

// ==========================================
// Bangsal (Ward)
// ==========================================

export async function createWardAction(
  formData: FormData
): Promise<{ ok: boolean; to?: string; error?: string }> {
  const actor = await requirePermission(PERMISSION_CODES.MASTER_MANAGE);

  const parsed = wardSchema.safeParse({
    code: ((formData.get("code") as string) || "").trim().toUpperCase(),
    name: ((formData.get("name") as string) || "").trim(),
    floor: formData.get("floor"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const taken = await prisma.ward.findUnique({ where: { code: parsed.data.code } });
  if (taken) {
    return { ok: false, error: `Kode bangsal '${parsed.data.code}' sudah terdaftar` };
  }

  await prisma.$transaction(async (tx) => {
    const ward = await tx.ward.create({
      data: {
        code: parsed.data.code,
        name: parsed.data.name,
        floor: parsed.data.floor,
      },
    });

    await tx.auditLog.create({
      data: {
        entityType: "MASTER_DATA",
        entityId: ward.id,
        action: "CREATE_WARD",
        actorId: actor.userId,
        details: { code: ward.code, name: ward.name },
      },
    });
  });

  revalidatePath("/bangsal");
  return { ok: true, to: "/bangsal" };
}

export async function updateWardAction(
  formData: FormData
): Promise<{ ok: boolean; to?: string; error?: string }> {
  const actor = await requirePermission(PERMISSION_CODES.MASTER_MANAGE);

  const wardId = formData.get("wardId") as string;
  if (!wardId) return { ok: false, error: "ID bangsal tidak valid" };

  const existing = await prisma.ward.findUnique({ where: { id: wardId } });
  if (!existing) return { ok: false, error: "Bangsal tidak ditemukan" };

  const name = ((formData.get("name") as string) || "").trim();
  const floor = Number(formData.get("floor"));
  if (name.length < 2) return { ok: false, error: "Nama bangsal wajib diisi" };
  if (!Number.isInteger(floor) || floor < 1 || floor > 50) {
    return { ok: false, error: "Lantai harus bilangan 1 sampai 50" };
  }

  await prisma.$transaction(async (tx) => {
    await tx.ward.update({ where: { id: wardId }, data: { name, floor } });

    await tx.auditLog.create({
      data: {
        entityType: "MASTER_DATA",
        entityId: wardId,
        action: "UPDATE_WARD",
        actorId: actor.userId,
        details: { code: existing.code, name },
      },
    });
  });

  revalidatePath("/bangsal");
  return { ok: true, to: "/bangsal" };
}

export async function deleteWardAction(
  wardId: string
): Promise<{ success: boolean; error?: string }> {
  const actor = await requirePermission(PERMISSION_CODES.MASTER_MANAGE);

  const existing = await prisma.ward.findUnique({
    where: { id: wardId },
    include: { _count: { select: { rooms: true } } },
  });
  if (!existing) return { success: false, error: "Bangsal tidak ditemukan" };
  if (existing._count.rooms > 0) {
    return {
      success: false,
      error: `Bangsal masih memiliki ${existing._count.rooms} ruang - hapus/pindahkan ruangnya dulu`,
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.ward.delete({ where: { id: wardId } });

    await tx.auditLog.create({
      data: {
        entityType: "MASTER_DATA",
        entityId: wardId,
        action: "DELETE_WARD",
        actorId: actor.userId,
        details: { code: existing.code, name: existing.name },
      },
    });
  });

  revalidatePath("/bangsal");
  return { success: true };
}

// ==========================================
// Ruang (Room)
// ==========================================

export async function createRoomAction(
  formData: FormData
): Promise<{ ok: boolean; to?: string; error?: string }> {
  const actor = await requirePermission(PERMISSION_CODES.MASTER_MANAGE);

  const parsed = roomSchema.safeParse({
    wardId: formData.get("wardId") as string,
    roomCode: ((formData.get("roomCode") as string) || "").trim().toUpperCase(),
    name: ((formData.get("name") as string) || "").trim(),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const ward = await prisma.ward.findUnique({ where: { id: parsed.data.wardId } });
  if (!ward) return { ok: false, error: "Bangsal tidak ditemukan" };

  const taken = await prisma.room.findUnique({ where: { roomCode: parsed.data.roomCode } });
  if (taken) {
    return { ok: false, error: `Kode ruang '${parsed.data.roomCode}' sudah terdaftar` };
  }

  await prisma.$transaction(async (tx) => {
    const room = await tx.room.create({
      data: {
        wardId: parsed.data.wardId,
        roomCode: parsed.data.roomCode,
        name: parsed.data.name,
      },
    });

    await tx.auditLog.create({
      data: {
        entityType: "MASTER_DATA",
        entityId: room.id,
        action: "CREATE_ROOM",
        actorId: actor.userId,
        details: { roomCode: room.roomCode, name: room.name },
      },
    });
  });

  revalidatePath("/bangsal");
  return { ok: true, to: "/bangsal" };
}

export async function updateRoomAction(
  formData: FormData
): Promise<{ ok: boolean; to?: string; error?: string }> {
  const actor = await requirePermission(PERMISSION_CODES.MASTER_MANAGE);

  const roomId = formData.get("roomId") as string;
  if (!roomId) return { ok: false, error: "ID ruang tidak valid" };

  // roomCode disengaja tidak bisa diubah: stabil untuk mapping navigasi
  // dan terikat FK pengantaran.
  const wardId = formData.get("wardId") as string;
  const name = ((formData.get("name") as string) || "").trim();
  if (!wardId) return { ok: false, error: "Bangsal wajib dipilih" };
  if (name.length < 2) return { ok: false, error: "Nama ruang wajib diisi" };

  const existing = await prisma.room.findUnique({ where: { id: roomId } });
  if (!existing) return { ok: false, error: "Ruang tidak ditemukan" };

  const ward = await prisma.ward.findUnique({ where: { id: wardId } });
  if (!ward) return { ok: false, error: "Bangsal tidak ditemukan" };

  await prisma.$transaction(async (tx) => {
    await tx.room.update({ where: { id: roomId }, data: { wardId, name } });

    await tx.auditLog.create({
      data: {
        entityType: "MASTER_DATA",
        entityId: roomId,
        action: "UPDATE_ROOM",
        actorId: actor.userId,
        details: { roomCode: existing.roomCode, name },
      },
    });
  });

  revalidatePath("/bangsal");
  return { ok: true, to: "/bangsal" };
}

export async function deleteRoomAction(
  roomId: string
): Promise<{ success: boolean; error?: string }> {
  const actor = await requirePermission(PERMISSION_CODES.MASTER_MANAGE);

  const existing = await prisma.room.findUnique({
    where: { id: roomId },
    include: {
      _count: { select: { beds: true, deliveryRequests: true } },
    },
  });
  if (!existing) return { success: false, error: "Ruang tidak ditemukan" };
  if (existing._count.deliveryRequests > 0) {
    return {
      success: false,
      error: `Ruang terikat ${existing._count.deliveryRequests} pengantaran - tidak dapat dihapus`,
    };
  }
  if (existing._count.beds > 0) {
    return {
      success: false,
      error: `Ruang masih memiliki ${existing._count.beds} tempat tidur - hapus dulu`,
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.room.delete({ where: { id: roomId } });

    await tx.auditLog.create({
      data: {
        entityType: "MASTER_DATA",
        entityId: roomId,
        action: "DELETE_ROOM",
        actorId: actor.userId,
        details: { roomCode: existing.roomCode, name: existing.name },
      },
    });
  });

  revalidatePath("/bangsal");
  return { success: true };
}

// ==========================================
// Tempat tidur (Bed)
// ==========================================

export async function addBedAction(
  roomId: string,
  bedNumber: string
): Promise<{ success: boolean; error?: string }> {
  const actor = await requirePermission(PERMISSION_CODES.MASTER_MANAGE);

  const number = (bedNumber || "").trim().toUpperCase();
  if (!number) return { success: false, error: "Nomor bed wajib diisi" };

  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) return { success: false, error: "Ruang tidak ditemukan" };

  const taken = await prisma.bed.findFirst({
    where: { roomId, bedNumber: number },
    select: { id: true },
  });
  if (taken) {
    return { success: false, error: `Bed '${number}' sudah ada di ruang ini` };
  }

  await prisma.$transaction(async (tx) => {
    const bed = await tx.bed.create({ data: { roomId, bedNumber: number } });

    await tx.auditLog.create({
      data: {
        entityType: "MASTER_DATA",
        entityId: bed.id,
        action: "ADD_BED",
        actorId: actor.userId,
        details: { roomCode: room.roomCode, bedNumber: number },
      },
    });
  });

  revalidatePath("/bangsal");
  revalidatePath("/pasien");
  return { success: true };
}

export async function toggleBedAction(
  bedId: string
): Promise<{ success: boolean; error?: string }> {
  const actor = await requirePermission(PERMISSION_CODES.MASTER_MANAGE);

  const existing = await prisma.bed.findUnique({
    where: { id: bedId },
    include: { room: { select: { roomCode: true } } },
  });
  if (!existing) return { success: false, error: "Bed tidak ditemukan" };

  // Bed yang masih ditempati pasien aktif hanya boleh diubah via menu Pasien,
  // agar flag hunian dan relasi pasien tidak berpisah.
  const occupant = await prisma.patient.findFirst({
    where: { bedId, dischargedAt: null },
    select: { fullName: true },
  });
  if (occupant) {
    return {
      success: false,
      error: `Bed ${existing.bedNumber} ditempati ${occupant.fullName}. Pindahkan pasien via menu Pasien dulu.`,
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.bed.update({
      where: { id: bedId },
      data: { isOccupied: !existing.isOccupied },
    });

    await tx.auditLog.create({
      data: {
        entityType: "MASTER_DATA",
        entityId: bedId,
        action: existing.isOccupied ? "BED_VACATED" : "BED_OCCUPIED",
        actorId: actor.userId,
        details: { roomCode: existing.room.roomCode, bedNumber: existing.bedNumber },
      },
    });
  });

  revalidatePath("/bangsal");
  revalidatePath("/pasien");
  return { success: true };
}

export async function deleteBedAction(
  bedId: string
): Promise<{ success: boolean; error?: string }> {
  const actor = await requirePermission(PERMISSION_CODES.MASTER_MANAGE);

  const existing = await prisma.bed.findUnique({
    where: { id: bedId },
    include: { room: { select: { roomCode: true } } },
  });
  if (!existing) return { success: false, error: "Bed tidak ditemukan" };

  const occupant = await prisma.patient.findFirst({
    where: { bedId, dischargedAt: null },
    select: { fullName: true },
  });
  if (occupant) {
    return {
      success: false,
      error: `Bed ${existing.bedNumber} ditempati ${occupant.fullName}. Pindahkan pasien via menu Pasien dulu.`,
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.bed.delete({ where: { id: bedId } });

    await tx.auditLog.create({
      data: {
        entityType: "MASTER_DATA",
        entityId: bedId,
        action: "DELETE_BED",
        actorId: actor.userId,
        details: { roomCode: existing.room.roomCode, bedNumber: existing.bedNumber },
      },
    });
  });

  revalidatePath("/bangsal");
  revalidatePath("/pasien");
  return { success: true };
}
