import { NextRequest } from "next/server";
import { checkMonitoringToken } from "@/lib/monitoring";

/**
 * DRAF mock - SIMRS → Monitoring.
 * Snapshot pengantaran + HANYA pasien rawat inap (dischargedAt null dan
 * punya roomCode) yang berubah sejak `since`, plus seluruh ruang/bed.
 * Monitoring melakukan polling endpoint ini sampai kontrak realtime final.
 */
export async function GET(req: NextRequest) {
  const gate = checkMonitoringToken(req);
  if (!gate.ok) return gate.response;

  const { searchParams } = new URL(req.url);
  const sinceRaw = searchParams.get("since");
  const since = sinceRaw
    ? new Date(sinceRaw)
    : new Date(Date.now() - 24 * 3600 * 1000);
  if (isNaN(since.getTime())) {
    return Response.json(
      { error: "Param since tidak valid (pakai ISO-8601)" },
      { status: 400 }
    );
  }
  const { default: prisma } = await import("@/lib/prisma");
  const limit = Math.min(Number(searchParams.get("limit") ?? 200), 200);

  const [patients, deliveries, rooms] = await Promise.all([
    prisma.patient.findMany({
      where: {
        updatedAt: { gt: since },
        dischargedAt: null,
        roomCode: { not: null },
      },
      orderBy: { updatedAt: "asc" },
      take: limit,
      select: {
        id: true,
        mrn: true,
        fullName: true,
        gender: true,
        roomCode: true,
        diagnosis: true,
        isInfectious: true,
        updatedAt: true,
      },
    }),
    prisma.deliveryRequest.findMany({
      where: { updatedAt: { gt: since } },
      orderBy: { updatedAt: "asc" },
      take: limit,
      select: {
        id: true,
        requestCode: true,
        status: true,
        roomCode: true,
        notes: true,
        requestedAt: true,
        updatedAt: true,
        prescription: {
          select: {
            code: true,
            patient: { select: { mrn: true, fullName: true } },
          },
        },
      },
    }),
    prisma.room.findMany({
      orderBy: { roomCode: "asc" },
      select: {
        roomCode: true,
        name: true,
        ward: { select: { code: true, name: true } },
        beds: {
          orderBy: { bedNumber: "asc" },
          select: { bedNumber: true, isOccupied: true },
        },
      },
    }),
  ]);

  return Response.json({
    generatedAt: new Date().toISOString(),
    since: since.toISOString(),
    counts: {
      patients: patients.length,
      deliveries: deliveries.length,
      rooms: rooms.length,
    },
    patients,
    rooms,
    deliveries,
  });
}
