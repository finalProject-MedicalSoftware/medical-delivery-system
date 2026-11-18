import { getCurrentUser } from "@/lib/auth";
import { liveStream } from "@/lib/live-stream";

export const dynamic = "force-dynamic";

/** SSE untuk UI SIMRS (sesi cookie). Memicu router.refresh() di klien. */
export async function GET(req: Request) {
  if (!(await getCurrentUser())) {
    return Response.json({ error: "Belum login" }, { status: 401 });
  }
  return liveStream(req.signal);
}
