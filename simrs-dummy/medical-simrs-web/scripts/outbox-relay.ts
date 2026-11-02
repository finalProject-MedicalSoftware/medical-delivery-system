import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { OUTBOX_BACKOFF_MS, OUTBOX_MAX_ATTEMPTS } from "../src/lib/outbox";

/**
 * F2 relay (kontrak §2.2): kirim event outbox PENDING ke
 * POST {MONITORING_CALLBACK_URL}/webhooks/simrs dengan header x-simrs-token.
 * At-least-once, retry eksponensial, 4xx (kecuali 429/5xx) langsung DEAD.
 * Env kosong → pending-honest: event tetap PENDING, tidak ada mutasi.
 */

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not defined in environment variables");
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const CALLBACK_URL = process.env.MONITORING_CALLBACK_URL;
const CALLBACK_TOKEN = process.env.MONITORING_CALLBACK_TOKEN;

// ponytail: relay single-instance tanpa claim lock; kalau nanti jalan >1 instance,
// ganti ke SELECT ... FOR UPDATE SKIP LOCKED (equivalent Prisma: $queryRaw).
const BATCH = 25;
const POLL_MS = 5000;
const TIMEOUT_MS = 10_000;

type OutboxRow = Awaited<ReturnType<typeof prisma.outboxEvent.findMany>>[number];

async function fail(row: OutboxRow, message: string, retryable: boolean) {
  const attempts = row.attempts + 1;
  const dead = !retryable || attempts >= OUTBOX_MAX_ATTEMPTS;
  const delay = OUTBOX_BACKOFF_MS[Math.min(attempts - 1, OUTBOX_BACKOFF_MS.length - 1)];
  await prisma.outboxEvent.update({
    where: { id: row.id },
    data: {
      attempts,
      status: dead ? "DEAD" : "PENDING",
      nextAttemptAt: dead ? undefined : new Date(Date.now() + delay),
      lastError: message.slice(0, 200),
    },
  });
  console.error(`[relay] ${dead ? "DEAD" : "retry"} ${row.eventId} (attempt ${attempts}/${OUTBOX_MAX_ATTEMPTS}): ${message}`);
}

async function send(row: OutboxRow) {
  try {
    const res = await fetch(`${CALLBACK_URL}/webhooks/simrs`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-simrs-token": CALLBACK_TOKEN! },
      body: JSON.stringify(row.payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) {
      await prisma.outboxEvent.update({
        where: { id: row.id },
        data: { status: "SENT", sentAt: new Date(), lastError: null },
      });
      console.log(`[relay] sent ${row.eventId} (${row.type})`);
      return;
    }
    await fail(row, `HTTP ${res.status}`, res.status === 429 || res.status >= 500);
  } catch (err) {
    await fail(row, err instanceof Error ? err.message : String(err), true); // network/timeout → retryable
  }
}

let busy = false;
async function tick() {
  // pending-honest: tanpa env, tidak menyentuh DB sama sekali.
  if (busy || !CALLBACK_URL || !CALLBACK_TOKEN) return;
  busy = true;
  try {
    const rows = await prisma.outboxEvent.findMany({
      where: { status: "PENDING", nextAttemptAt: { lte: new Date() } },
      orderBy: { createdAt: "asc" },
      take: BATCH,
    });
    for (const row of rows) await send(row);
  } catch (err) {
    console.error("[relay] poll error:", err instanceof Error ? err.message : err);
  } finally {
    busy = false;
  }
}

if (!CALLBACK_URL || !CALLBACK_TOKEN) {
  console.log(
    "[relay] pending-honest: MONITORING_CALLBACK_URL / MONITORING_CALLBACK_TOKEN belum diset — event outbox tetap PENDING, tidak ada pengiriman. Isi env lalu jalankan ulang."
  );
} else {
  console.log(`[relay] kirim event PENDING ke ${CALLBACK_URL}/webhooks/simrs (token ${CALLBACK_TOKEN.slice(0, 4)}***)`);
}

void tick();
setInterval(() => void tick(), POLL_MS);
