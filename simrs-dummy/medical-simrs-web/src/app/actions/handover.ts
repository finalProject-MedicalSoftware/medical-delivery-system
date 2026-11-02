"use server";

import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { PERMISSION_CODES } from "@/lib/rbac";
import { resolveHandover } from "@/lib/handover";
import { canConfirmHandover } from "@/lib/handover-status";
import { verifyScanToken } from "@/lib/qr-token";
import { enqueueOutbox } from "@/lib/outbox";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

/**
 * Konfirmasi serah-terima obat lewat scan QR pasien.
 * Satu-satunya jalur MOCK_ARRIVED_AT_ROOM -> MOCK_HANDOVER_CONFIRMED.
 * Robot tidak boleh konfirmasi sendiri (MONITORING_TRANSITIONS tidak punya
 * entri ini); konfirmasi dilakukan manusia yang login via halaman scan.
 */
export async function confirmHandoverAction(mrn: string, token: string): Promise<void> {
  const actor = await requirePermission(PERMISSION_CODES.DELIVERY_CREATE);

  // Token ditandatangani; redirect wajib membawa `t` agar halaman tujuan tidak
  // menampilkan state "QR Tidak Valid" setelah aksi yang sah.
  const back = (q: string) => `/scan/${mrn}?${q}&t=${encodeURIComponent(token)}`;

  // Verifikasi ulang di server: server action bisa dipanggil langsung tanpa
  // melewati render halaman scan.
  if (!verifyScanToken(mrn, token)) {
    redirect(back("err=invalid-token"));
  }

  const info = await resolveHandover(mrn);
  if (!info || !info.delivery) {
    redirect(back("err=no-delivery"));
  }

  const delivery = info.delivery;
  if (!canConfirmHandover(delivery.status)) {
    redirect(back("err=not-arrived"));
  }

  await prisma.$transaction(async (tx) => {
    await tx.deliveryRequest.update({
      where: { id: delivery.id },
      data: { status: "MOCK_HANDOVER_CONFIRMED" },
    });

    await tx.deliveryEvent.create({
      data: {
        deliveryRequestId: delivery.id,
        eventType: "HANDOVER_CONFIRMED",
        statusBefore: delivery.status,
        statusAfter: "MOCK_HANDOVER_CONFIRMED",
        actorId: actor.userId,
        isSimulation: true,
        notes: "Serah-terima dikonfirmasi via scan QR pasien",
        payload: {
          method: "QR_SCAN",
          patientMrn: info.patient.mrn,
          ...(delivery.compartmentNo !== null ? { compartmentNo: delivery.compartmentNo } : {}),
        },
      },
    });

    await tx.auditLog.create({
      data: {
        entityType: "DELIVERY_REQUEST",
        entityId: delivery.id,
        action: "HANDOVER_CONFIRMED",
        actorId: actor.userId,
        details: {
          from: delivery.status,
          to: "MOCK_HANDOVER_CONFIRMED",
          method: "QR_SCAN",
          patientMrn: info.patient.mrn,
        },
      },
    });

    // Outbox F2: satu-satunya jalur HANDOVER_CONFIRMED (kontrak §2.3; data
    // khusus {patientMrn, compartmentNo, method} berasal dari manusia).
    await enqueueOutbox(tx, {
      requestCode: delivery.requestCode,
      from: delivery.status,
      to: "MOCK_HANDOVER_CONFIRMED",
      patientMrn: info.patient.mrn,
      compartmentNo: delivery.compartmentNo,
    });
  });

  revalidatePath(`/scan/${mrn}`);
  revalidatePath(`/pengantaran/${delivery.id}`);
  revalidatePath("/pengantaran");
  revalidatePath("/dashboard");
  redirect(back("ok=1"));
}
