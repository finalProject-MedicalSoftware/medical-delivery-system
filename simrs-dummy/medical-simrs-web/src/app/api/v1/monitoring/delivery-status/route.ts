import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { checkMonitoringToken, getMonitoringActorId } from "@/lib/monitoring";
import { revalidatePath } from "next/cache";
import { DeliveryStatus, Prisma } from "@prisma/client";
import { DELIVERY_STATUS_LABELS, DELIVERY_TRANSITIONS } from "@/lib/delivery-status";

/**
 * Kontrak FINAL (fase mock) - Monitoring → SIMRS.
 * Monitoring melempar status pengantaran obat ke SIMRS.
 * Body: { requestCode, toStatus, note?, compartmentNo?, idempotencyKey? }
 * `compartmentNo` wajib ada saat lapor tiba: robot yang memetakan
 * requestCode -> kompartemen, SIMRS hanya menyimpannya di payload event.
 * `idempotencyKey` opsional (1-64 char A-Za-z0-9._:-): bila kombinasi
 * requestCode + toStatus sama dengan pertama kali, SIMRS membalas hasil
 * request pertama tanpa eksekusi ulang (aman untuk retry network).
 */

const KNOWN_STATUSES: DeliveryStatus[] = Object.keys(DELIVERY_STATUS_LABELS) as DeliveryStatus[];

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/;
const IDEMPOTENCY_KEY_ERROR =
  "idempotencyKey harus string 1-64 karakter dari [A-Za-z0-9._:-]";

// Transisi yang boleh dilempar monitoring = tabel utama di
// lib/delivery-status MINUS edge ke MOCK_HANDOVER_CONFIRMED (serah-terima
// hanya dari halaman scan /scan/[mrn] oleh manusia yang login).
// MOCK_ARRIVED_AT_ROOM jadi punya daftar kosong -> lemparan apapun = 422.
const MONITORING_TRANSITIONS: Partial<Record<DeliveryStatus, DeliveryStatus[]>> =
  Object.fromEntries(
    Object.entries(DELIVERY_TRANSITIONS).map(([from, tos]) => [
      from,
      (tos ?? []).filter((to) => to !== "MOCK_HANDOVER_CONFIRMED"),
    ])
  ) as Partial<Record<DeliveryStatus, DeliveryStatus[]>>;

function duplicateResponse(
  requestCode: string,
  statusBefore: string | null,
  statusAfter: string
) {
  return Response.json({
    success: true,
    duplicate: true,
    requestCode,
    from: statusBefore,
    to: statusAfter,
  });
}

export async function POST(req: NextRequest) {
  const gate = checkMonitoringToken(req);
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body harus JSON valid" }, { status: 400 });
  }

  const {
    requestCode,
    toStatus,
    note,
    compartmentNo,
    idempotencyKey: idempotencyKeyRaw,
  } = (body ?? {}) as {
    requestCode?: unknown;
    toStatus?: unknown;
    note?: unknown;
    compartmentNo?: unknown;
    idempotencyKey?: unknown;
  };

  if (typeof requestCode !== "string" || !requestCode) {
    return Response.json({ error: "requestCode wajib diisi" }, { status: 400 });
  }
  if (typeof toStatus !== "string" || !(KNOWN_STATUSES as readonly string[]).includes(toStatus)) {
    return Response.json(
      { error: `toStatus harus salah satu: ${KNOWN_STATUSES.join(", ")}` },
      { status: 400 }
    );
  }

  // idempotencyKey opsional: null/undefined berarti tidak memakai dedupe;
  // nilai lain divalidasi pola di atas sebelum dipakai.
  let idempotencyKey: string | null = null;
  if (idempotencyKeyRaw !== undefined && idempotencyKeyRaw !== null) {
    if (typeof idempotencyKeyRaw !== "string" || !IDEMPOTENCY_KEY_PATTERN.test(idempotencyKeyRaw)) {
      return Response.json({ error: IDEMPOTENCY_KEY_ERROR }, { status: 400 });
    }
    idempotencyKey = idempotencyKeyRaw;
  }

  // Pemetaan requestCode -> kompartemen milik robot. SIMRS hanya menyimpannya
  // di payload event supaya halaman scan bisa menampilkan kompartemen mana
  // yang harus dibuka saat serah-terima.
  let compartment: number | null = null;
  if (compartmentNo !== undefined && compartmentNo !== null) {
    if (typeof compartmentNo !== "number" || !Number.isInteger(compartmentNo) || compartmentNo < 0) {
      return Response.json(
        { error: "compartmentNo harus bilangan bulat >= 0" },
        { status: 400 }
      );
    }
    compartment = compartmentNo;
  }

  const delivery = await prisma.deliveryRequest.findUnique({
    where: { requestCode },
  });
  if (!delivery) {
    return Response.json(
      { error: `Pengantaran '${requestCode}' tidak ditemukan` },
      { status: 404 }
    );
  }

  // Replay idempotent: bila key pernah dipakai untuk kombinasi
  // requestCode + toStatus YANG SAMA, balas hasil request pertama.
  // Kombinasi berbeda = salah kirim payload -> 409.
  if (idempotencyKey) {
    const existing = await prisma.deliveryEvent.findUnique({
      where: { idempotencyKey },
      include: { deliveryRequest: { select: { requestCode: true } } },
    });
    if (existing) {
      if (
        existing.deliveryRequest.requestCode !== requestCode ||
        existing.statusAfter !== toStatus
      ) {
        return Response.json(
          {
            error:
              "idempotencyKey sudah dipakai untuk kombinasi requestCode + toStatus yang berbeda",
            idempotencyKeyUsedFor: {
              requestCode: existing.deliveryRequest.requestCode,
              toStatus: existing.statusAfter,
            },
          },
          { status: 409 }
        );
      }
      return duplicateResponse(requestCode, existing.statusBefore, existing.statusAfter);
    }
  }

  const allowed = MONITORING_TRANSITIONS[delivery.status] ?? [];
  const to = toStatus as DeliveryStatus;
  if (!allowed.includes(to)) {
    return Response.json(
      { error: `Transisi ${delivery.status} ke ${to} tidak diperbolehkan` },
      { status: 422 }
    );
  }

  const actorId = await getMonitoringActorId();
  if (!actorId) {
    return Response.json(
      {
        error: "Akun layanan monitoring_service belum di-seed",
        hint: "Jalankan: npx prisma db seed",
      },
      { status: 503 }
    );
  }

  const isSimulation = to.startsWith("MOCK_");
  try {
    await prisma.$transaction(async (tx) => {
      await tx.deliveryRequest.update({
        where: { id: delivery.id },
        data: { status: to },
      });

      await tx.deliveryEvent.create({
        data: {
          deliveryRequestId: delivery.id,
          eventType: "STATUS_CHANGE",
          statusBefore: delivery.status,
          statusAfter: to,
          idempotencyKey,
          actorId: null,
          isSimulation,
          notes: typeof note === "string" && note ? note : "Status dilempar dari monitoring",
          payload: {
            source: "monitoring",
            ...(isSimulation ? { simulationLabel: "[MOCK]" } : {}),
            // Hanya disimpan saat lapor tiba; halaman scan membacanya dari sini.
            ...(to === "MOCK_ARRIVED_AT_ROOM" && compartment !== null
              ? { compartmentNo: compartment }
              : {}),
          },
        },
      });

      await tx.auditLog.create({
        data: {
          entityType: "DELIVERY_REQUEST",
          entityId: delivery.id,
          action: "MONITORING_STATUS_CHANGE",
          actorId,
          details: { from: delivery.status, to, requestCode, idempotencyKey },
        },
      });
    });
  } catch (err) {
    // Dua request duplikat yang mencapai server bersamaan bisa lolos cek
    // di atas secara bersamaan; constraint unique memenangkan yang pertama.
    // Yang kalah dibalas dengan hasil request pertama (200 duplicate: true).
    if (idempotencyKey && err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existing = await prisma.deliveryEvent.findUnique({ where: { idempotencyKey } });
      if (existing && existing.statusAfter === toStatus) {
        return duplicateResponse(requestCode, existing.statusBefore, existing.statusAfter);
      }
    }
    throw err;
  }

  revalidatePath(`/pengantaran/${delivery.id}`);
  revalidatePath("/pengantaran");
  revalidatePath("/dashboard");

  return Response.json({
    success: true,
    duplicate: false,
    requestCode,
    from: delivery.status,
    to,
    ...(idempotencyKey ? { idempotencyKey } : {}),
  });
}
