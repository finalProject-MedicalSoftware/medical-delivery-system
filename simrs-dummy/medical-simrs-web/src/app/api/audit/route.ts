import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** Ekspor CSV audit trail (maks 5000 entri terbaru), opsional ?entityType=. Izin audit:read. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Belum login" }, { status: 401 });
  if (!hasPermission(user, "audit:read")) return Response.json({ error: "Tidak berizin" }, { status: 403 });
  const entityType = new URL(req.url).searchParams.get("entityType") || undefined;
  const logs = await prisma.auditLog.findMany({
    where: entityType ? { entityType } : undefined,
    orderBy: { createdAt: "desc" },
    take: 5000,
    include: { actor: { select: { username: true } } },
  });
  const lines = logs.map((l) =>
    [l.createdAt.toISOString(), l.entityType, l.entityId, l.action, l.actor?.username ?? "", JSON.stringify(l.details ?? {})].map(esc).join(",")
  );
  return new Response(["createdAt,entityType,entityId,action,actor,details", ...lines].join("\n") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="audit-trail.csv"',
    },
  });
}
