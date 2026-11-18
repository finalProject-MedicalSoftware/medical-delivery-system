import { checkMonitoringToken } from "@/lib/monitoring";
import { liveStream } from "@/lib/live-stream";

export const dynamic = "force-dynamic";

/**
 * Monitoring/HMI → SIMRS (baca): SSE perubahan status pengantaran + resep.
 * Auth: header x-monitoring-token (EventSource browser tidak bisa; pakai fetch stream).
 * Hanya pengantaran yang sudah dikirim ke robot ("Kirim ke Robot"). Events: ready,
 * delivery {requestCode, roomCode, from, to, at}, ": ping".
 * Tidak menggantikan outbox+webhook (itu jalur at-least-once ke backend).
 */
export async function GET(req: Request) {
  const gate = checkMonitoringToken(req);
  if (!gate.ok) return gate.response;
  return liveStream(req.signal, true);
}
