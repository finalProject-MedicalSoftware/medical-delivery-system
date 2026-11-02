import { NextRequest } from "next/server";
import { checkMonitoringToken } from "@/lib/monitoring";
import { ACTIVE_DELIVERY_STATUSES, deliveryStatusLabel } from "@/lib/delivery-status";

/**
 * Kontrak FINAL (fase mock) - read API: cek pasien per nomor rekam medis
 * untuk konsumen non-manusia (robot / sistem monitoring). Pasien dari
 * seed, semua data sintetis.
 *
 * Isi respons TIDAK menyertakan compartmentNo; pemetaan robot ke
 * kompartemen hanya tersimpan di payload event MOCK_ARRIVED_AT_ROOM.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ mrn: string }> }) {
  const gate = checkMonitoringToken(req);
  if (!gate.ok) return gate.response;

  const { mrn } = await ctx.params;
  const { default: prisma } = await import("@/lib/prisma");
  const patient = await prisma.patient.findUnique({
    where: { mrn },
    include: {
      bed: { include: { room: { include: { ward: true } } } },
    },
  });
  if (!patient) {
    return Response.json(
      { error: `Pasien dengan nomor rekam medis '${mrn}' tidak ditemukan` },
      { status: 404 }
    );
  }

  // Sama dengan aturan snapshot: masih dirawat = belum discharged DAN punya ruang.
  const active = patient.dischargedAt === null && patient.roomCode !== null;

  const activeDeliveries = await prisma.deliveryRequest.findMany({
    where: {
      prescription: { patientId: patient.id },
      status: { in: ACTIVE_DELIVERY_STATUSES },
    },
    orderBy: { requestedAt: "desc" },
    include: {
      room: { select: { roomCode: true, name: true } },
      prescription: { select: { code: true } },
    },
  });

  return Response.json({
    patient: {
      mrn: patient.mrn,
      fullName: patient.fullName,
      gender: patient.gender, // "L" / "P"
      dateOfBirth: patient.dateOfBirth.toISOString(),
      diagnosis: patient.diagnosis,
      isInfectious: patient.isInfectious,
      // ALERT infeksi (pasien menular -> waspada kontak/droplet/airborne).
      isSynthetic: patient.isSynthetic,
      roomCode: patient.roomCode,
      roomName: patient.bed?.room.name ?? null,
      wardCode: patient.bed?.room.ward.code ?? null,
      wardName: patient.bed?.room.ward.name ?? null,
      bedNumber: patient.bed?.bedNumber ?? null,
      active,
      dischargedAt: patient.dischargedAt?.toISOString() ?? null,
    },
    activeDeliveries: activeDeliveries.map((d) => ({
      id: d.id,
      requestCode: d.requestCode,
      status: d.status,
      statusLabel: deliveryStatusLabel(d.status),
      roomCode: d.room.roomCode,
      roomName: d.room.name,
      prescriptionCode: d.prescription.code,
      requestedAt: d.requestedAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
    })),
  });
}
