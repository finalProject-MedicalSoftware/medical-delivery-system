import { describe, it, expect } from "vitest";
import { summarizeDeliveries, toCsv, type ReportRow } from "@/lib/report";

const t = (m: number) => new Date(Date.UTC(2026, 10, 18, 8, m));
const row = (over: Partial<ReportRow> = {}): ReportRow => ({
  requestCode: "DELIV-1",
  requestedAt: t(0),
  status: "HANDOVER_CONFIRMED",
  priority: "ROUTINE",
  roomCode: "R-1",
  events: [
    { statusAfter: "IN_TRANSIT", createdAt: t(2) },
    { statusAfter: "ARRIVED_AT_ROOM", createdAt: t(7) },
    { statusAfter: "HANDOVER_CONFIRMED", createdAt: t(9) },
  ],
  ...over,
});

describe("summarizeDeliveries", () => {
  it("menghitung rata-rata menit per tahap dan total", () => {
    const s = summarizeDeliveries([row()]);
    expect(s.avgMinutes).toEqual({ waitingForRobot: 2, travel: 5, waitingForHandover: 2, endToEnd: 9 });
    expect(s.completed).toBe(1);
  });
  it("pengantaran belum selesai tidak ikut rata-rata, dihitung per prioritas dan batal", () => {
    const s = summarizeDeliveries([row(), row({ status: "CANCELLED", priority: "STAT", events: [] })]);
    expect(s.count).toBe(2);
    expect(s.cancelled).toBe(1);
    expect(s.stat).toBe(1);
    expect(s.avgMinutes.endToEnd).toBe(9);
  });
  it("tanpa data: rata-rata null, bukan NaN", () => {
    expect(summarizeDeliveries([]).avgMinutes.endToEnd).toBeNull();
  });
});

describe("toCsv", () => {
  it("memberi header dan mengutip nilai berisi koma", () => {
    const csv = toCsv([row({ roomCode: 'R,"1"' })]);
    expect(csv.split("\n")[0]).toBe("requestCode,requestedAt,status,priority,roomCode,inTransitAt,arrivedAt,handoverAt");
    expect(csv).toContain('"R,""1"""');
  });
});
