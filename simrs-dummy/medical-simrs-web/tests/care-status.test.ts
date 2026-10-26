import { describe, it, expect } from "vitest";
import { getCareStatus, CARE_STATUS_LABEL } from "@/lib/care-status";

describe("Status perawatan pasien di tabel", () => {
  it("menandai selesai bila dischargedAt terisi", () => {
    expect(getCareStatus({ dischargedAt: new Date(), roomCode: "R-MELATI-101" })).toBe("selesai");
    expect(getCareStatus({ dischargedAt: new Date(), roomCode: null })).toBe("selesai");
  });

  it("menandai dirawat bila aktif dan punya ruang", () => {
    expect(getCareStatus({ dischargedAt: null, roomCode: "R-MELATI-101" })).toBe("dirawat");
  });

  it("menandai rawat jalan bila aktif tanpa ruang", () => {
    expect(getCareStatus({ dischargedAt: null, roomCode: null })).toBe("rawat-jalan");
  });

  it("menyediakan label Indonesia untuk semua status", () => {
    expect(CARE_STATUS_LABEL.dirawat).toBe("Dirawat");
    expect(CARE_STATUS_LABEL["rawat-jalan"]).toBe("Rawat jalan");
    expect(CARE_STATUS_LABEL.selesai).toBe("Selesai");
  });
});
