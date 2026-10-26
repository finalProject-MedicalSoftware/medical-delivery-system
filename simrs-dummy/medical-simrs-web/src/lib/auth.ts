import prisma from "./prisma";
import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { createSessionCookie, clearSessionCookie, getSession, SessionPayload } from "./session";
import { hasPermission, hasAnyRole, ROLE_CODES, UserAuthContext } from "./rbac";
import { checkRateLimit } from "./rate-limit";

const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 60_000;

/** IP klien dari proxy headers; undefined bila di luar konteks request (test). */
async function getClientIp(): Promise<string | undefined> {
  try {
    const h = await headers();
    return h.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
  } catch {
    return undefined;
  }
}

export interface LoginResult {
  success: boolean;
  user?: UserAuthContext;
  error?: string;
}

/**
 * Authenticates user credentials and returns session context
 */
export async function authenticateCredentials(
  username: string,
  password: string
): Promise<LoginResult> {
  if (!username || !password) {
    return { success: false, error: "Username dan password wajib diisi" };
  }

  const user = await prisma.user.findUnique({
    where: { username },
    include: {
      userRoles: {
        include: {
          role: {
            include: {
              rolePermissions: {
                include: {
                  permission: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!user || !user.isActive) {
    return { success: false, error: "Kredensial tidak valid atau akun dinonaktifkan" };
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    return { success: false, error: "Kredensial tidak valid" };
  }

  // Extract roles and distinct permissions (multi-role union)
  const roles: string[] = [];
  const permissionsSet = new Set<string>();

  for (const ur of user.userRoles) {
    roles.push(ur.role.code);
    for (const rp of ur.role.rolePermissions) {
      permissionsSet.add(rp.permission.code);
    }
  }

  const permissions = Array.from(permissionsSet);

  const authContext: UserAuthContext = {
    userId: user.id,
    username: user.username,
    fullName: user.fullName,
    roles,
    permissions,
  };

  return { success: true, user: authContext };
}

/**
 * Logs in a user, sets session cookie, and records audit log
 */
export async function loginUser(username: string, password: string): Promise<LoginResult> {
  // Throttle per username dan per IP: maks 5 percobaan/menit (mis. brute force).
  const ip = await getClientIp();
  const keys = [
    `login:u:${username}`,
    ...(ip ? [`login:ip:${ip}`] : []),
  ];
  for (const key of keys) {
    const rl = checkRateLimit(key, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS);
    if (!rl.ok) {
      return {
        success: false,
        error: `Terlalu banyak percobaan login. Coba lagi dalam ${rl.retryAfterSec} detik.`,
      };
    }
  }

  const result = await authenticateCredentials(username, password);

  if (!result.success || !result.user) {
    return result;
  }

  const payload: SessionPayload = {
    userId: result.user.userId,
    username: result.user.username,
    fullName: result.user.fullName,
    roles: result.user.roles,
    permissions: result.user.permissions,
  };

  await createSessionCookie(payload);

  // Record audit log
  await prisma.auditLog.create({
    data: {
      entityType: "USER",
      entityId: result.user.userId,
      action: "USER_LOGIN",
      actorId: result.user.userId,
      details: {
        username: result.user.username,
        roles: result.user.roles,
      },
    },
  });

  return result;
}

/**
 * Logs out the current user and clears session cookie
 */
export async function logoutUser(): Promise<void> {
  const session = await getSession();
  if (session) {
    try {
      await prisma.auditLog.create({
        data: {
          entityType: "USER",
          entityId: session.userId,
          action: "USER_LOGOUT",
          actorId: session.userId,
          details: { username: session.username },
        },
      });
    } catch {
      // Ignore audit fail during logout
    }
  }
  await clearSessionCookie();
}

/**
 * Gets the current active user context from session
 */
export async function getCurrentUser(): Promise<UserAuthContext | null> {
  const session = await getSession();
  if (!session) return null;

  // Cookie sesi (JWT 24 jam) tetap valid setelah migrate reset/seed ulang,
  // padahal ID user di DB dibuat ulang. Verifikasi ke DB agar actorId audit
  // tidak menunjuk user yang sudah tidak ada (FK audit_logs_actor_id_fkey).
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, isActive: true },
  });
  if (!user || !user.isActive) return null;

  return {
    userId: session.userId,
    username: session.username,
    fullName: session.fullName,
    roles: session.roles,
    permissions: session.permissions,
  };
}

/**
 * Requires an authenticated session, otherwise throws an Unauthorized error
 */
export async function requireAuth(): Promise<UserAuthContext> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("UNAUTHORIZED: Sesi tidak ditemukan atau telah kedaluwarsa");
  }
  return user;
}

/**
 * Requires the authenticated user to have a specific permission
 */
export async function requirePermission(permission: string): Promise<UserAuthContext> {
  const user = await requireAuth();
  if (!hasPermission(user, permission)) {
    throw new Error(`FORBIDDEN: Pengguna tidak memiliki izin '${permission}'`);
  }
  return user;
}

/**
 * Requires the authenticated user to possess at least one of the given roles
 */
export async function requireRole(roles: string | string[]): Promise<UserAuthContext> {
  const user = await requireAuth();
  const allowedRoles = Array.isArray(roles) ? roles : [roles];
  if (!hasAnyRole(user, allowedRoles)) {
    throw new Error(`FORBIDDEN: Diperlukan role [${allowedRoles.join(", ")}]`);
  }
  return user;
}

/**
 * Assigns a role to a user (Requires SYSTEM_ADMIN or admin:roles)
 */
export async function assignUserRole(
  targetUserId: string,
  roleCode: string,
  actorId: string
): Promise<{ success: boolean; message: string }> {
  const role = await prisma.role.findUnique({ where: { code: roleCode } });
  if (!role) {
    throw new Error(`Role '${roleCode}' tidak ditemukan`);
  }

  const existing = await prisma.userRole.findUnique({
    where: {
      userId_roleId: { userId: targetUserId, roleId: role.id },
    },
  });

  if (existing) {
    return { success: true, message: "Pengguna sudah memiliki role ini" };
  }

  await prisma.userRole.create({
    data: {
      userId: targetUserId,
      roleId: role.id,
    },
  });

  await prisma.auditLog.create({
    data: {
      entityType: "USER_ROLE",
      entityId: targetUserId,
      action: "ASSIGN_ROLE",
      actorId,
      details: { roleCode, targetUserId },
    },
  });

  return { success: true, message: `Role ${roleCode} berhasil ditambahkan` };
}

/**
 * Revokes a role from a user (Requires SYSTEM_ADMIN or admin:roles)
 */
export async function revokeUserRole(
  targetUserId: string,
  roleCode: string,
  actorId: string
): Promise<{ success: boolean; message: string }> {
  const role = await prisma.role.findUnique({ where: { code: roleCode } });
  if (!role) {
    throw new Error(`Role '${roleCode}' tidak ditemukan`);
  }

  await prisma.userRole.deleteMany({
    where: {
      userId: targetUserId,
      roleId: role.id,
    },
  });

  await prisma.auditLog.create({
    data: {
      entityType: "USER_ROLE",
      entityId: targetUserId,
      action: "REVOKE_ROLE",
      actorId,
      details: { roleCode, targetUserId },
    },
  });

  return { success: true, message: `Role ${roleCode} berhasil dicabut` };
}
