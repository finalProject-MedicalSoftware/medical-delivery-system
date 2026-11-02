"use server";

import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { PERMISSION_CODES } from "@/lib/rbac";
import { createDeliveryRequestSchema } from "@/lib/validations";
import { revalidatePath } from "next/cache";
import { DeliveryStatus } from "@prisma/client";
import { DELIVERY_TRANSITIONS } from "@/lib/delivery-status";
import { enqueueOutbox } from "@/lib/outbox";

async function generateDeliveryCode(): Promise<string> {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const count = await prisma.deliveryRequest.count({
    where: { requestCode: { startsWith: `DELIV-${today}` } },
  });
  return `DELIV-${today}-${String(count + 1).padStart(4, "0")}`;
}

export async function createDeliveryRequestAction(
  formData: FormData
): Promise<{ ok: boolean; to?: string; error?: string }> {
  const actor = await requirePermission(PERMISSION_CODES.DELIVERY_CREATE);

  const raw = {
    prescriptionId: formData.get("prescriptionId") as string,
    roomCode: formData.get("roomCode") as string,
    notes: (formData.get("notes") as string) || null,
  };

  const parsed = createDeliveryRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  // Validate prescription is READY_FOR_DELIVERY
  const rx = await prisma.prescription.findUnique({
    where: { id: parsed.data.prescriptionId },
    include: { patient: true },
  });
  if (!rx) return { ok: false, error: "Resep tidak ditemukan" };
  if (rx.status !== "READY_FOR_DELIVERY") {
    return {
      ok: false,
      error: `Resep harus berstatus READY_FOR_DELIVERY (saat ini: ${rx.status})`,
    };
  }

  // Gate: hanya pasien menular
  if (!rx.patient.isInfectious) {
    return {
      ok: false,
      error: `Pengantaran hanya untuk pasien menular. Pasien ${rx.patient.fullName} (${rx.patient.mrn}) bukan pasien menular.`,
    };
  }

  // Validate room exists
  const room = await prisma.room.findUnique({ where: { roomCode: parsed.data.roomCode } });
  if (!room) return { ok: false, error: `Ruang dengan kode '${parsed.data.roomCode}' tidak ditemukan` };

  // Check for duplicate pending delivery
  const existing = await prisma.deliveryRequest.findFirst({
    where: {
      prescriptionId: parsed.data.prescriptionId,
      status: { in: ["DELIVERY_REQUESTED", "PENDING_INTEGRATION", "MOCK_IN_TRANSIT"] },
    },
  });
  if (existing) {
    return {
      ok: false,
      error: `Sudah ada permintaan pengantaran aktif untuk resep ini (${existing.requestCode})`,
    };
  }

  const requestCode = await generateDeliveryCode();

  await prisma.$transaction(async (tx) => {
    const delivery = await tx.deliveryRequest.create({
      data: {
        requestCode,
        prescriptionId: parsed.data.prescriptionId,
        roomCode: parsed.data.roomCode,
        requestedById: actor.userId,
        notes: parsed.data.notes,
        status: "DELIVERY_REQUESTED",
      },
    });

    // Record first event
    await tx.deliveryEvent.create({
      data: {
        deliveryRequestId: delivery.id,
        eventType: "STATUS_CHANGE",
        statusBefore: null,
        statusAfter: "DELIVERY_REQUESTED",
        actorId: actor.userId,
        isSimulation: false,
        notes: "Permintaan pengantaran dibuat",
      },
    });

    await tx.auditLog.create({
      data: {
        entityType: "DELIVERY_REQUEST",
        entityId: delivery.id,
        action: "CREATE_DELIVERY",
        actorId: actor.userId,
        details: { requestCode, prescriptionId: parsed.data.prescriptionId, roomCode: parsed.data.roomCode },
      },
    });

    // Outbox F2: event awal dikirim relay ke Web Monitoring (kontrak §2.2).
    await enqueueOutbox(tx, {
      requestCode,
      from: null,
      to: "DELIVERY_REQUESTED",
    });
  });

  revalidatePath("/pengantaran");
  revalidatePath("/dashboard");
  return { ok: true, to: "/pengantaran" };
}

// Tabel transisi bersama ada di lib/delivery-status (dipakai juga oleh
// endpoint monitoring). Konfirmasi serah-terima hanya lewat scan QR.
export async function advanceDeliveryStatusAction(
  deliveryId: string,
  newStatus: DeliveryStatus,
  notes?: string
): Promise<{ success: boolean; error?: string }> {
  const actor = await requirePermission(PERMISSION_CODES.DELIVERY_CREATE);

  const delivery = await prisma.deliveryRequest.findUnique({ where: { id: deliveryId } });
  if (!delivery) return { success: false, error: "Permintaan pengantaran tidak ditemukan" };

  const allowed = DELIVERY_TRANSITIONS[delivery.status] ?? [];
  if (!allowed.includes(newStatus)) {
    return {
      success: false,
      error: `Transisi ${delivery.status} → ${newStatus} tidak diperbolehkan`,
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.deliveryRequest.update({
      where: { id: deliveryId },
      data: { status: newStatus },
    });

    await tx.deliveryEvent.create({
      data: {
        deliveryRequestId: deliveryId,
        eventType: "STATUS_CHANGE",
        statusBefore: delivery.status,
        statusAfter: newStatus,
        actorId: actor.userId,
        isSimulation: newStatus.startsWith("MOCK_"),
        notes: notes ?? null,
        payload: newStatus.startsWith("MOCK_") ? { simulationLabel: "[DEMO/MOCK]" } : undefined,
      },
    });

    await tx.auditLog.create({
      data: {
        entityType: "DELIVERY_REQUEST",
        entityId: deliveryId,
        action: "STATUS_CHANGE",
        actorId: actor.userId,
        details: { from: delivery.status, to: newStatus },
      },
    });

    // Outbox F2: transisi ini juga diterbitkan ke Web Monitoring.
    // ponytail: compartmentNo tidak ikut di sini karena DeliveryRequest tidak
    // menyimpannya (hanya di payload event arrival, ditulis route monitoring) —
    // bila nanti SIMRS juga bisa mengumumkan kedatangan, resolve dari
    // DeliveryEvent terakhir berstatus MOCK_ARRIVED_AT_ROOM seperti resolveHandover.
    await enqueueOutbox(tx, {
      requestCode: delivery.requestCode,
      from: delivery.status,
      to: newStatus,
      note: notes ?? null,
    });
  });

  revalidatePath(`/pengantaran/${deliveryId}`);
  revalidatePath("/pengantaran");
  revalidatePath("/dashboard");
  return { success: true };
}
