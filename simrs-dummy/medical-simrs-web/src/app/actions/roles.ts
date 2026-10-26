"use server";

import { assignUserRole, revokeUserRole } from "@/lib/auth";
import { requireRole } from "@/lib/auth";
import { ROLE_CODES } from "@/lib/rbac";
import { revalidatePath } from "next/cache";

export async function assignRoleAction(
  targetUserId: string,
  roleCode: string,
  actorId: string
): Promise<{ success: boolean; message: string }> {
  await requireRole([ROLE_CODES.SYSTEM_ADMIN, ROLE_CODES.SIMRS_ADMIN]);
  const result = await assignUserRole(targetUserId, roleCode, actorId);
  revalidatePath("/pengguna");
  return result;
}

export async function revokeRoleAction(
  targetUserId: string,
  roleCode: string,
  actorId: string
): Promise<{ success: boolean; message: string }> {
  await requireRole([ROLE_CODES.SYSTEM_ADMIN, ROLE_CODES.SIMRS_ADMIN]);
  const result = await revokeUserRole(targetUserId, roleCode, actorId);
  revalidatePath("/pengguna");
  return result;
}
