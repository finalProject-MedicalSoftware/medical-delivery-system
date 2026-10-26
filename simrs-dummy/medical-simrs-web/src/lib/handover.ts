import prisma from "@/lib/prisma";

/**
 * Resolver scan QR pasien. Hanya identitas pasien yang disimpan di QR;
 * sisa data (pengantaran aktif, isi kompartemen, daftar obat) dibaca live
 * dari database supaya tidak pernah basi.
 *
 * Pemetaan kompartemen dimiliki sisi monitoring/robot: robot mengirim
 * `compartmentNo` saat melaporkan tiba, dan nilai itu tersimpan di payload
 * event MOCK_ARRIVED_AT_ROOM. SIMRS tidak menyimpan kolom kompartemen.
 */

export interface HandoverItem {
  name: string;
  quantity: number;
  unit: string;
  instructions: string | null;
}

export interface HandoverInfo {
  patient: {
    id: string;
    mrn: string;
    fullName: string;
    roomCode: string | null;
    bedNumber: string | null;
    diagnosis: string | null;
    isInfectious: boolean;
    discharged: boolean;
  };
  delivery: {
    id: string;
    requestCode: string;
    status: string;
    compartmentNo: number | null;
    roomCode: string;
    roomName: string | null;
    wardName: string | null;
    prescriptionCode: string;
    items: HandoverItem[];
  } | null;
}

function compartmentFrom(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") return null;
  const v = (payload as Record<string, unknown>).compartmentNo;
  return typeof v === "number" ? v : null;
}

export async function resolveHandover(mrn: string): Promise<HandoverInfo | null> {
  const patient = await prisma.patient.findUnique({
    where: { mrn },
    select: {
      id: true,
      mrn: true,
      fullName: true,
      roomCode: true,
      diagnosis: true,
      isInfectious: true,
      dischargedAt: true,
      bed: { select: { bedNumber: true } },
    },
  });
  if (!patient) return null;

  const deliveries = await prisma.deliveryRequest.findMany({
    where: {
      prescription: { patientId: patient.id },
      status: { not: "CANCELLED" },
    },
    take: 10,
    orderBy: { requestedAt: "desc" },
    include: {
      room: { include: { ward: { select: { name: true } } } },
      prescription: {
        select: {
          code: true,
          items: {
            include: { medicine: { select: { name: true, unit: true } } },
          },
        },
      },
      events: {
        where: { statusAfter: "MOCK_ARRIVED_AT_ROOM" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { payload: true },
      },
    },
  });

  const active = deliveries.find((d) => d.status === "MOCK_ARRIVED_AT_ROOM") ?? deliveries[0] ?? null;

  return {
    patient: {
      id: patient.id,
      mrn: patient.mrn,
      fullName: patient.fullName,
      roomCode: patient.roomCode,
      bedNumber: patient.bed?.bedNumber ?? null,
      diagnosis: patient.diagnosis,
      isInfectious: patient.isInfectious,
      discharged: patient.dischargedAt !== null,
    },
    delivery: active
      ? {
          id: active.id,
          requestCode: active.requestCode,
          status: active.status,
          compartmentNo: compartmentFrom(active.events[0]?.payload),
          roomCode: active.roomCode,
          roomName: active.room?.name ?? null,
          wardName: active.room?.ward?.name ?? null,
          prescriptionCode: active.prescription.code,
          items: active.prescription.items.map((it) => ({
            name: it.medicine.name,
            quantity: it.quantity,
            unit: it.medicine.unit,
            instructions: it.instructions,
          })),
        }
      : null,
  };
}
