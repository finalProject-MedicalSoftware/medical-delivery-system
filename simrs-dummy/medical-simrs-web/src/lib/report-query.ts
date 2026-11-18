import prisma from "@/lib/prisma";
import type { ReportRow } from "@/lib/report";

/** Pengantaran sejak `days` hari terakhir dalam bentuk baris laporan. */
export async function loadReportRows(days: number): Promise<ReportRow[]> {
  const since = new Date(Date.now() - days * 24 * 3600 * 1000);
  const rows = await prisma.deliveryRequest.findMany({
    where: { requestedAt: { gte: since } },
    orderBy: { requestedAt: "asc" },
    include: {
      events: { select: { statusAfter: true, createdAt: true }, orderBy: { createdAt: "asc" } },
      prescription: { select: { priority: true } },
    },
  });
  return rows.map((r) => ({
    requestCode: r.requestCode,
    requestedAt: r.requestedAt,
    status: r.status,
    priority: r.prescription.priority,
    roomCode: r.roomCode,
    events: r.events,
  }));
}

export function parseDays(raw: string | null | undefined): number {
  const n = Number(raw);
  return [7, 30, 90].includes(n) ? n : 7;
}
