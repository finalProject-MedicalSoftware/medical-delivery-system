import { NextRequest } from "next/server";
import { checkMonitoringToken } from "@/lib/monitoring";
import type { Prisma } from "@prisma/client";

/** Read-only, paginated patient directory for mission planning. */
export async function GET(req: NextRequest) {
  const gate = checkMonitoringToken(req);
  if (!gate.ok) return gate.response;

  const { searchParams } = new URL(req.url);
  const query = (searchParams.get("query") ?? "").trim().slice(0, 100);
  const cursor = (searchParams.get("cursor") ?? "").trim();
  const infectiousOnly = searchParams.get("infectiousOnly") === "true";
  const limit = Math.max(1, Math.min(Number(searchParams.get("limit") ?? 50) || 50, 100));
  const { default: prisma } = await import("@/lib/prisma");
  const where: Prisma.PatientWhereInput = {
    ...(infectiousOnly ? { isInfectious: true } : {}),
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
        bed: { select: { bedNumber: true, room: { select: { name: true } } } },
      },
    }),
    prisma.patient.count({ where }),
  ]);
  const hasMore = rows.length > limit;
  const patients = rows.slice(0, limit).map((patient) => ({
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
  }));

  return Response.json({
    patients,
    total,
    nextCursor: hasMore ? patients.at(-1)?.id ?? null : null,
  });
}
