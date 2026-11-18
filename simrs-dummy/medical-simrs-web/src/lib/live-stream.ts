import prisma from "@/lib/prisma";
import { MONITORING_VISIBLE_WHERE } from "@/lib/delivery-status";

/**
 * Aliran SSE perubahan status (pengantaran + resep). Dipakai oleh
 * /api/live (sesi UI) dan /api/v1/monitoring/stream (token monitoring).
 * shortcut: polling DB tiap 2 dtk per koneksi; ganti ke LISTEN/NOTIFY
 * bila koneksi SSE bersamaan > ~50.
 */
const POLL_MS = 2000;

/**
 * monitoring=true (token monitoring): hanya pengantaran yang sudah dikirim ke robot,
 * tanpa event resep. monitoring=false (UI SIMRS): semua.
 */
export function liveStream(signal: AbortSignal, monitoring = false): Response {
  const enc = new TextEncoder();
  let timer: ReturnType<typeof setInterval>;
  let cursor = new Date();
  let rxCursor = new Date();

  const stream = new ReadableStream({
    start(controller) {
      const send = (chunk: string) => {
        try { controller.enqueue(enc.encode(chunk)); } catch { /* sudah ditutup */ }
      };
      send(`event: ready\ndata: ${JSON.stringify({ at: cursor.toISOString() })}\n\n`);

      const tick = async () => {
        try {
          const [events, rx] = await Promise.all([
            prisma.deliveryEvent.findMany({
              where: {
                createdAt: { gt: cursor },
                ...(monitoring ? { statusAfter: { not: "DELIVERY_REQUESTED" }, deliveryRequest: MONITORING_VISIBLE_WHERE } : {}),
              },
              orderBy: { createdAt: "asc" },
              take: 50,
              include: { deliveryRequest: { select: { requestCode: true, roomCode: true } } },
            }),
            monitoring ? Promise.resolve(null) : prisma.prescription.findFirst({
              where: { updatedAt: { gt: rxCursor } },
              orderBy: { updatedAt: "desc" },
              select: { updatedAt: true },
            }),
          ]);
          for (const e of events) {
            cursor = e.createdAt;
            send(`event: delivery\ndata: ${JSON.stringify({
              requestCode: e.deliveryRequest.requestCode,
              roomCode: e.deliveryRequest.roomCode,
              from: e.statusBefore,
              to: e.statusAfter,
              at: e.createdAt.toISOString(),
            })}\n\n`);
          }
          if (rx) {
            rxCursor = rx.updatedAt;
            send(`event: prescription\ndata: ${JSON.stringify({ at: rx.updatedAt.toISOString() })}\n\n`);
          }
          if (!events.length && !rx) send(": ping\n\n");
        } catch {
          send(": error\n\n");
        }
      };
      timer = setInterval(tick, POLL_MS);
      signal.addEventListener("abort", () => {
        clearInterval(timer);
        try { controller.close(); } catch { /* sudah ditutup */ }
      });
    },
    cancel() { clearInterval(timer); },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
