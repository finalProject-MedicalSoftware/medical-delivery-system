/**
 * Data gelang identitas pasien (server-only): dipakai halaman pratinjau
 * `/pasien/[id]/gelang` dan halaman cetak `/cetak/gelang/[id]` agar isinya identik.
 *
 * Isi kode tidak berubah (kontrak dengan HMI robot, lihat medical-hmi/src/identity/wristband.ts):
 *  - QR      : URL serah-terima `{QR_BASE_URL}/scan/{mrn}?t=<token>` (HP petugas & kamera tablet);
 *  - Code 128: MRN mentah (scanner genggam & kamera tablet).
 */
import QRCode from "qrcode";
import prisma from "@/lib/prisma";
import { patientQrUrl } from "@/lib/wristband";
import { mrnCode128DataUrl } from "@/lib/wristband-code128";

export type PrintFormat = "thermal" | "a4";
export const parseFormat = (v: string | undefined): PrintFormat => (v === "a4" ? "a4" : "thermal");

export interface WristbandData {
  fullName: string;
  mrn: string;
  gender: "L" | "P";
  birthDate: string; // dd/mm/yyyy
  age: number;
  room: string;
  bed: string;
  allergies: string[];
  isInfectious: boolean;
  qrSvgDataUrl: string;
  code128DataUrl: string | null;
}

export type WristbandResult =
  | { kind: "ok"; data: WristbandData }
  | { kind: "not-inpatient"; fullName: string; mrn: string }
  | { kind: "not-found" };

export async function loadWristband(id: string, now = new Date()): Promise<WristbandResult> {
  const p = await prisma.patient.findUnique({
    where: { id },
    select: {
      fullName: true, mrn: true, gender: true, dateOfBirth: true, dischargedAt: true,
      roomCode: true, allergies: true, isInfectious: true, bed: { select: { bedNumber: true } },
    },
  });
  if (!p) return { kind: "not-found" };
  // Gelang hanya untuk pasien rawat inap aktif: punya bed dan belum pulang.
  if (!p.bed || p.dischargedAt) return { kind: "not-inpatient", fullName: p.fullName, mrn: p.mrn };

  const birth = new Date(p.dateOfBirth);
  let age = now.getFullYear() - birth.getFullYear();
  if (birth.getMonth() > now.getMonth() || (birth.getMonth() === now.getMonth() && birth.getDate() > now.getDate())) age -= 1;

  // QR sebesar mungkin di band 25 mm; koreksi galat "L" = modul lebih besar sehingga lebih mudah dibaca kamera tablet.
  const svg = await QRCode.toString(patientQrUrl(p.mrn), { type: "svg", errorCorrectionLevel: "L", margin: 0 });

  return {
    kind: "ok",
    data: {
      fullName: p.fullName,
      mrn: p.mrn,
      gender: p.gender === "L" ? "L" : "P",
      birthDate: birth.toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" }),
      age,
      room: p.roomCode ?? "-",
      bed: String(p.bed.bedNumber),
      allergies: p.allergies.map((a) => a.trim()).filter(Boolean),
      isInfectious: p.isInfectious,
      qrSvgDataUrl: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
      code128DataUrl: mrnCode128DataUrl(p.mrn),
    },
  };
}
