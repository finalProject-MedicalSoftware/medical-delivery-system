/** Ringkasan laporan pengantaran (fungsi murni, mudah diuji). */

export interface ReportRow {
  requestCode: string;
  requestedAt: Date;
  status: string;
  priority: string;
  roomCode: string;
  events: { statusAfter: string; createdAt: Date }[];
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const minutes = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 60000;

function at(row: ReportRow, status: string): Date | null {
  return row.events.find((e) => e.statusAfter === status)?.createdAt ?? null;
}

export function summarizeDeliveries(rows: ReportRow[]) {
  const transit: number[] = [];
  const travel: number[] = [];
  const handoverWait: number[] = [];
  const total: number[] = [];
  const perDay: Record<string, number> = {};
  for (const r of rows) {
    const day = r.requestedAt.toISOString().slice(0, 10);
    perDay[day] = (perDay[day] ?? 0) + 1;
    const inTransit = at(r, "IN_TRANSIT");
    const arrived = at(r, "ARRIVED_AT_ROOM");
    const done = at(r, "HANDOVER_CONFIRMED");
    if (inTransit) transit.push(minutes(r.requestedAt, inTransit));
    if (inTransit && arrived) travel.push(minutes(inTransit, arrived));
    if (arrived && done) handoverWait.push(minutes(arrived, done));
    if (done) total.push(minutes(r.requestedAt, done));
  }
  return {
    count: rows.length,
    completed: rows.filter((r) => r.status === "HANDOVER_CONFIRMED").length,
    cancelled: rows.filter((r) => r.status === "CANCELLED").length,
    urgent: rows.filter((r) => r.priority === "URGENT").length,
    stat: rows.filter((r) => r.priority === "STAT").length,
    avgMinutes: {
      waitingForRobot: mean(transit),
      travel: mean(travel),
      waitingForHandover: mean(handoverWait),
      endToEnd: mean(total),
    },
    perDay: Object.entries(perDay).sort(([a], [b]) => a.localeCompare(b)),
  };
}

export function toCsv(rows: ReportRow[]): string {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const head = ["requestCode", "requestedAt", "status", "priority", "roomCode", "inTransitAt", "arrivedAt", "handoverAt"];
  const lines = rows.map((r) =>
    [
      r.requestCode,
      r.requestedAt.toISOString(),
      r.status,
      r.priority,
      r.roomCode,
      at(r, "IN_TRANSIT")?.toISOString() ?? "",
      at(r, "ARRIVED_AT_ROOM")?.toISOString() ?? "",
      at(r, "HANDOVER_CONFIRMED")?.toISOString() ?? "",
    ].map(esc).join(",")
  );
  return [head.join(","), ...lines].join("\n") + "\n";
}
