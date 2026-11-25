import { NextRequest } from "next/server";
import { checkMonitoringToken } from "@/lib/monitoring";
import { ITEMS_SELECT, mapItems } from "@/lib/delivery-items";
import { MONITORING_ACTIVE_STATUSES, deliveryStatusLabel } from "@/lib/delivery-status";
import { hmiBrief } from "@/lib/hmi-brief";

/**
 * Kontrak FINAL (fase mock) - read API: daftar pengantaran yang masih
 * berjalan untuk antrian web monitoring. Tanpa `compartmentNo`;
 * data kompartemen hanya di payload event ARRIVED_AT_ROOM.
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

  const { default: prisma } = await import("@/lib/prisma");
  const deliveries = await prisma.deliveryRequest.findMany({
    where: { status: { in: MONITORING_ACTIVE_STATUSES } },
    orderBy: { requestedAt: "desc" },
    take: limit,
    include: {
      room: { select: { roomCode: true, name: true } },
      prescription: {
        select: {
          code: true,
          priority: true,
          ...ITEMS_SELECT,
          doseTimes: true,
          repeatMode: true,
          intervalDays: true,
          patient: {
            select: {
              mrn: true,
              fullName: true,
              gender: true,
              isInfectious: true,
              allergies: true,
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
        // Alasan pengantaran robot (hanya untuk pasien tidak menular).
        robotReason: d.robotReason,
        priority: d.prescription.priority,
        // Item obat yang harus diserahkan (nama, jumlah, aturan pakai).
        items: mapItems(d.prescription.items),
        // doseTimes adalah metadata informasional resep, bukan penjadwalan otomatis.
        schedule: d.prescription.doseTimes.length > 0
          ? {
              doseTimes: d.prescription.doseTimes,
              repeatMode: d.prescription.repeatMode,
              ...(d.prescription.intervalDays != null
                ? { intervalDays: d.prescription.intervalDays }
                : {}),
            }
          : null,
        patient: {
          mrn: p.mrn,
          fullName: p.fullName,
          gender: p.gender, // "L" / "P"
          isInfectious: p.isInfectious,
          allergies: p.allergies,
          // Ruang PASIEN saat ini (bisa beda bila pasien pindah bed).
          roomCode: p.roomCode,
          roomName: p.bed?.room.name ?? null,
          wardCode: p.bed?.room.ward.code ?? null,
          wardName: p.bed?.room.ward.name ?? null,
          bedNumber: p.bed?.bedNumber ?? null,
          dischargedAt: p.dischargedAt?.toISOString() ?? null,
        },
        // Untuk HMI robot (aditif): hash MRN (cocokkan scan gelang), inisial, alergi,
        // URL jadwal keluarga bertoken. Backend menitipkannya di OP.tray_tasks[].brief.
        hmi: hmiBrief(p, d.requestCode),
        requestedAt: d.requestedAt.toISOString(),
        updatedAt: d.updatedAt.toISOString(),
      };
    }),
  });
}
