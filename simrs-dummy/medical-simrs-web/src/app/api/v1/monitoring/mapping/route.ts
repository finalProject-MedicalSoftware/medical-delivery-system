import { NextRequest } from "next/server";
import { checkMonitoringToken } from "@/lib/monitoring";
import type { DeliveryStatus, PrescriptionStatus } from "@prisma/client";
import {
  DELIVERY_STATUS_LABELS,
  PRESCRIPTION_STATUS_LABELS,
  deliveryStatusLabel,
  prescriptionStatusLabel,
} from "@/lib/delivery-status";

function yq(v: string): string {
  return `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

// Severity khusus tampilan YAML monitoring. Label dan daftar status
// berasal dari lib/delivery-status supaya tidak pernah berbeda dengan UI.
// Label kode MOCK_ memuat awalan [MOCK]; monitoring menampilkan
// `simulation: true` untuk kode tersebut.
const DELIVERY_SEVERITIES: Record<DeliveryStatus, string> = {
  DELIVERY_REQUESTED: "info",
  PENDING_INTEGRATION: "warning",
  MOCK_IN_TRANSIT: "info",
  MOCK_ARRIVED_AT_ROOM: "ok",
  MOCK_HANDOVER_CONFIRMED: "ok",
  CANCELLED: "muted",
};

const PRESCRIPTION_SEVERITIES: Record<PrescriptionStatus, string> = {
  DRAFT: "muted",
  SUBMITTED: "info",
  VERIFIED: "ok",
  REJECTED: "bad",
  PREPARING: "warning",
  READY_FOR_DELIVERY: "ok",
  CANCELLED: "muted",
};

const DELIVERY_META: Record<string, { label: string; severity: string; simulation?: boolean }> =
  Object.fromEntries(
    (Object.keys(DELIVERY_STATUS_LABELS) as DeliveryStatus[]).map((code) => [
      code,
      {
        label: deliveryStatusLabel(code),
        severity: DELIVERY_SEVERITIES[code],
        ...(code.startsWith("MOCK_") ? { simulation: true } : {}),
      },
    ])
  );

const PRESCRIPTION_META: Record<string, { label: string; severity: string }> = Object.fromEntries(
  (Object.keys(PRESCRIPTION_STATUS_LABELS) as PrescriptionStatus[]).map((code) => [
    code,
    { label: prescriptionStatusLabel(code), severity: PRESCRIPTION_SEVERITIES[code] },
  ])
);

function statusBlock(meta: Record<string, { label: string; severity: string; simulation?: boolean }>): string {
  return Object.entries(meta)
    .map(([code, m]) =>
      `    ${code}: { label: ${yq(m.label)}, severity: ${m.severity}${
        m.simulation ? ", simulation: true" : ""
      } }`
    )
    .join("\n");
}

/**
 * DRAF mock - peta sinkronisasi untuk website monitoring.
 * YAML ini di-generate LIVE dari database SIMRS setiap diminta,
 * jadi monitoring yang fetch ulang otomatis selalu sesuai
 * (bangsal/ruang/bed baru ikut tanpa edit manual).
 */
export async function GET(req: NextRequest) {
  const gate = checkMonitoringToken(req);
  if (!gate.ok) return gate.response;

  const { default: prisma } = await import("@/lib/prisma");
  const wards = await prisma.ward.findMany({
    orderBy: { code: "asc" },
    include: {
      rooms: {
        orderBy: { roomCode: "asc" },
        include: { beds: { orderBy: { bedNumber: "asc" } } },
      },
    },
  });

  const wardsYaml = wards
    .map((w) => {
      const roomsYaml = w.rooms
        .map((r) => {
          const bedsYaml = r.beds
            .map((b) => `          - { number: ${yq(b.bedNumber)}, occupied: ${b.isOccupied} }`)
            .join("\n");
          return (
            `      - roomCode: ${yq(r.roomCode)}\n` +
            `        name: ${yq(r.name)}\n` +
            `        beds:\n${bedsYaml || "          []"}`
          );
        })
        .join("\n");
      return (
        `  - code: ${yq(w.code)}\n` +
        `    name: ${yq(w.name)}\n` +
        `    floor: ${w.floor}\n` +
        `    rooms:\n${roomsYaml || "      []"}`
      );
    })
    .join("\n");

  const yaml =
    `# AUTO-GENERATED oleh SIMRS - jangan edit manual.\n` +
    `# Ambil ulang dari endpoint ini agar monitoring selalu sinkron.\n` +
    `version: 1\n` +
    `generatedAt: ${yq(new Date().toISOString())}\n` +
    `source: "simrs-dummy"\n` +
    `polling:\n` +
    `  snapshot: "/api/v1/monitoring/snapshot?since=ISO-8601"\n` +
    `  mapping: "/api/v1/monitoring/mapping"\n` +
    `  deliveryStatus: "/api/v1/monitoring/delivery-status"\n` +
    `  recommendedIntervalSeconds: 30\n` +
    `roomCodePattern: "^[A-Z0-9-_]+$"\n` +
    `statuses:\n` +
    `  delivery:\n${statusBlock(DELIVERY_META)}\n` +
    `  prescription:\n${statusBlock(PRESCRIPTION_META)}\n` +
    `wards:\n${wardsYaml || "  []"}\n`;

  return new Response(yaml, {
    headers: { "Content-Type": "text/yaml; charset=utf-8" },
  });
}
