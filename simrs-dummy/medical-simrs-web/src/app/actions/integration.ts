"use server";

import prisma from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { revalidatePath } from "next/cache";

/** Kirim ulang event outbox yang DEAD (reset percobaan; relay mengambilnya di siklus berikutnya). */
export async function retryOutboxAction(id: string): Promise<{ success: boolean; error?: string }> {
  await requireRole(["SYSTEM_ADMIN", "SIMRS_ADMIN"]);
  const res = await prisma.outboxEvent.updateMany({
    where: { id, status: "DEAD" },
    data: { status: "PENDING", attempts: 0, nextAttemptAt: new Date(), lastError: null },
  });
  if (res.count === 0) return { success: false, error: "Event tidak ditemukan atau tidak berstatus DEAD" };
  revalidatePath("/integrasi");
  return { success: true };
}
