import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { checkMonitoringToken } from "@/lib/monitoring";
import { ACTIVE_DELIVERY_STATUSES, deliveryStatusLabel } from "@/lib/delivery-status";

/**
 * Kontrak FINAL (fase mock) - read API: daftar pengantaran yang masih
 * berjalan untuk antrian web monitoring. Tanpa `compartmentNo`;
 * data kompartemen hanya di payload event MOCK_ARRIVED_AT_ROOM.
 *
 * Query: `?limit=` default 100, maks 200.
 */
export async function GET(req: NextRequest) {
  const gate = checkMonitoringToken(req);
  if (!gate.ok) return gate.response;

  const { searchParams } = new URL(req.url);
  const limitRaw = searchParams.get("limit");
  let limit = 100;
  if (limitRaw !== null) {
    const parsed = Number(limitRaw);
    if (!Number.isInteger(parsed) || parsed < 1) {
      return Response.json({ error: "limit harus bilangan bulat >= 1" }, { status: 400 });
    }
    limit = Math.min(parsed, 200);
  }

  const deliveries = await prisma.deliveryRequest.findMany({
    where: { status: { in: ACTIVE_DELIVERY_STATUSES } },
    orderBy: { requestedAt: "desc" },
    take: limit,
    include: {
      room: { select: { roomCode: true, name: true } },
      prescription: {
        select: {
          code: true,
          patient: {
            select: {
              mrn: true,
              fullName: true,
              gender: true,
              roomCode: true,
              dischargedAt: true,
              bed: {
                select: {
                  bedNumber: true,
                  room: { include: { ward: { select: { code: true, name: true } } } },
                },
              },
            },
          },
        },
      },
    },
  });

  return Response.json({
    generatedAt: new Date().toISOString(),
    count: deliveries.length,
    deliveries: deliveries.map((d) => {
      const p = d.prescription.patient;
      return {
        id: d.id,
        requestCode: d.requestCode,
        status: d.status,
        statusLabel: deliveryStatusLabel(d.status),
        // Ruang TUJUAN pengantaran.
        roomCode: d.room.roomCode,
        roomName: d.room.name,
        prescriptionCode: d.prescription.code,
        patient: {
          mrn: p.mrn,
          fullName: p.fullName,
          gender: p.gender, // "L" / "P"
          // Ruang PASIEN saat ini (bisa beda bila pasien pindah bed).
          roomCode: p.roomCode,
          roomName: p.bed?.room.name ?? null,
          wardCode: p.bed?.room.ward.code ?? null,
          wardName: p.bed?.room.ward.name ?? null,
          bedNumber: p.bed?.bedNumber ?? null,
          dischargedAt: p.dischargedAt?.toISOString() ?? null,
        },
        requestedAt: d.requestedAt.toISOString(),
        updatedAt: d.updatedAt.toISOString(),
      };
    }),
  });
}
