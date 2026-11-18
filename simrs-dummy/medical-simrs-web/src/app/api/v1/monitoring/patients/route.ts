import { NextRequest } from "next/server";
import { checkMonitoringToken } from "@/lib/monitoring";
import type { Prisma } from "@prisma/client";
import { MONITORING_ACTIVE_STATUSES } from "@/lib/delivery-status";
import { robotEligibility } from "@/lib/robot-eligibility";

/**
 * Read-only, paginated patient directory for mission planning.
 * `deliveryReady=true`: hanya pasien yang punya pengantaran yang sudah dikirim ke robot
 * (tidak semua pasien). Tiap pasien membawa `robotEligible` dan `robotReason`.
 */
export async function GET(req: NextRequest) {
  const gate = checkMonitoringToken(req);
  if (!gate.ok) return gate.response;

  const { searchParams } = new URL(req.url);
  const query = (searchParams.get("query") ?? "").trim().slice(0, 100);
  const cursor = (searchParams.get("cursor") ?? "").trim();
  const infectiousOnly = searchParams.get("infectiousOnly") === "true";
  const deliveryReady = searchParams.get("deliveryReady") === "true";
  // Layak = ada pengantaran terkirim DAN (pasien menular ATAU pengantaran itu beralasan) — sama dengan robotEligibility().
  const dispatched = {
    OR: [
      { isInfectious: true, prescriptions: { some: { deliveryRequests: { some: { status: { in: MONITORING_ACTIVE_STATUSES } } } } } },
      { prescriptions: { some: { deliveryRequests: { some: { status: { in: MONITORING_ACTIVE_STATUSES }, robotReason: { not: null } } } } } },
    ],
  };
  const limit = Math.max(1, Math.min(Number(searchParams.get("limit") ?? 50) || 50, 100));
  const { default: prisma } = await import("@/lib/prisma");
  const where: Prisma.PatientWhereInput = {
    ...(infectiousOnly ? { isInfectious: true } : {}),
    ...(deliveryReady ? { AND: [dispatched] } : {}),
    ...(query ? { OR: [
      { fullName: { contains: query, mode: "insensitive" } },
      { mrn: { contains: query, mode: "insensitive" } },
    ] } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.patient.findMany({
      where,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: [{ fullName: "asc" }, { id: "asc" }],
      take: limit + 1,
      select: {
        id: true,
        mrn: true,
        fullName: true,
        roomCode: true,
        bedId: true,
        isInfectious: true,
        dischargedAt: true,
        updatedAt: true,
        prescriptions: {
          select: {
            deliveryRequests: {
              where: { status: { in: MONITORING_ACTIVE_STATUSES } },
              select: { requestCode: true, status: true, robotReason: true },
            },
          },
        },
        bed: { select: { bedNumber: true, room: { select: { name: true } } } },
      },
    }),
    prisma.patient.count({ where }),
  ]);
  const hasMore = rows.length > limit;
  const patients = rows.slice(0, limit).map((patient) => {
    const deliveries = patient.prescriptions.flatMap((p) => p.deliveryRequests);
    return {
    id: patient.id,
    mrn: patient.mrn,
    fullName: patient.fullName,
    roomCode: patient.roomCode,
    roomName: patient.bed?.room.name ?? null,
    bedId: patient.bedId,
    bedNumber: patient.bed?.bedNumber ?? null,
    isInfectious: patient.isInfectious,
    active: patient.dischargedAt === null && Boolean(patient.roomCode && patient.bedId),
    placementUpdatedAt: patient.updatedAt.toISOString(),
    ...robotEligibility(patient.isInfectious, deliveries),
    activeDeliveries: deliveries.map((d) => ({ requestCode: d.requestCode, status: d.status })),
  };
  });

  return Response.json({
    patients,
    total,
    nextCursor: hasMore ? patients.at(-1)?.id ?? null : null,
  });
}
