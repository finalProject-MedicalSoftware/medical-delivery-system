export const ROLE_CODES = {
  SYSTEM_ADMIN: "SYSTEM_ADMIN",
  SIMRS_ADMIN: "SIMRS_ADMIN",
  DOCTOR: "DOCTOR",
  PHARMACIST: "PHARMACIST",
  PHARMACY_STAFF: "PHARMACY_STAFF",
  NURSE: "NURSE",
  WARD_ADMIN: "WARD_ADMIN",
} as const;

export type RoleCode = (typeof ROLE_CODES)[keyof typeof ROLE_CODES];

export const PERMISSION_CODES = {
  ADMIN_ACCESS: "admin:access",
  ADMIN_ROLES: "admin:roles",
  MASTER_MANAGE: "master:manage",
  PRESCRIPTION_CREATE: "prescription:create",
  PRESCRIPTION_READ: "prescription:read",
  PRESCRIPTION_VERIFY: "prescription:verify",
  PRESCRIPTION_PREPARE: "prescription:prepare",
  DELIVERY_CREATE: "delivery:create",
  DELIVERY_READ: "delivery:read",
  AUDIT_READ: "audit:read",
} as const;

export type PermissionCode = (typeof PERMISSION_CODES)[keyof typeof PERMISSION_CODES];

export interface UserAuthContext {
  userId: string;
  username: string;
  fullName: string;
  roles: string[];
  permissions: string[];
}

/**
 * Check if user context possesses at least one of the specified roles
 */
export function hasAnyRole(context: UserAuthContext | null, roles: string[]): boolean {
  if (!context || !context.roles) return false;
  return roles.some((role) => context.roles.includes(role));
}

/**
 * Check if user context possesses all of the specified roles
 */
export function hasAllRoles(context: UserAuthContext | null, roles: string[]): boolean {
  if (!context || !context.roles) return false;
  return roles.every((role) => context.roles.includes(role));
}

/**
 * Check if user context possesses a specific permission
 */
export function hasPermission(context: UserAuthContext | null, permission: string): boolean {
  if (!context || !context.permissions) return false;
  // SYSTEM_ADMIN possesses all rights by design
  if (context.roles.includes(ROLE_CODES.SYSTEM_ADMIN)) return true;
  return context.permissions.includes(permission);
}

/**
 * Check if user context possesses at least one of the specified permissions
 */
export function hasAnyPermission(context: UserAuthContext | null, permissions: string[]): boolean {
  if (!context || !context.permissions) return false;
  if (context.roles.includes(ROLE_CODES.SYSTEM_ADMIN)) return true;
  return permissions.some((perm) => context.permissions.includes(perm));
}
