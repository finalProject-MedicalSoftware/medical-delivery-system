import { describe, it, expect, afterAll } from "vitest";
import prisma from "@/lib/prisma";
import { authenticateCredentials, assignUserRole, revokeUserRole } from "@/lib/auth";
import { hasPermission, PERMISSION_CODES, ROLE_CODES } from "@/lib/rbac";

describe("Slice 2: Auth & Multi-Role Verification", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("should successfully authenticate demo doctor with correct password", async () => {
    const result = await authenticateCredentials("dr_budi", "demo12345");
    expect(result.success).toBe(true);
    expect(result.user).toBeDefined();
    expect(result.user?.username).toBe("dr_budi");
    expect(result.user?.roles).toContain(ROLE_CODES.DOCTOR);
  });

  it("should reject authentication with invalid password safely", async () => {
    const result = await authenticateCredentials("dr_budi", "wrong_password");
    expect(result.success).toBe(false);
    expect(result.error).toBe("Kredensial tidak valid");
    expect(result.user).toBeUndefined();
  });

  it("should reject authentication with non-existent username", async () => {
    const result = await authenticateCredentials("user_tidak_ada", "demo12345");
    expect(result.success).toBe(false);
    expect(result.error).toBe("Kredensial tidak valid atau akun dinonaktifkan");
  });

  it("should confirm multirole_user has both DOCTOR and PHARMACIST roles and permissions", async () => {
    const result = await authenticateCredentials("multirole_user", "demo12345");
    expect(result.success).toBe(true);
    expect(result.user).toBeDefined();

    const user = result.user!;
    // Multi-role check
    expect(user.roles).toContain(ROLE_CODES.DOCTOR);
    expect(user.roles).toContain(ROLE_CODES.PHARMACIST);

    // Permission union check
    expect(hasPermission(user, PERMISSION_CODES.PRESCRIPTION_CREATE)).toBe(true); // From DOCTOR
    expect(hasPermission(user, PERMISSION_CODES.PRESCRIPTION_VERIFY)).toBe(true); // From PHARMACIST
    expect(hasPermission(user, PERMISSION_CODES.PRESCRIPTION_PREPARE)).toBe(true); // From PHARMACIST
  });

  it("should enforce least-privilege: single-role doctor cannot verify prescriptions", async () => {
    const result = await authenticateCredentials("dr_budi", "demo12345");
    expect(result.success).toBe(true);
    const doctor = result.user!;

    expect(hasPermission(doctor, PERMISSION_CODES.PRESCRIPTION_CREATE)).toBe(true);
    expect(hasPermission(doctor, PERMISSION_CODES.PRESCRIPTION_VERIFY)).toBe(false);
  });

  it("should enforce least-privilege: pharmacist cannot create prescription orders", async () => {
    const result = await authenticateCredentials("apt_dewi", "demo12345");
    expect(result.success).toBe(true);
    const pharmacist = result.user!;

    expect(hasPermission(pharmacist, PERMISSION_CODES.PRESCRIPTION_VERIFY)).toBe(true);
    expect(hasPermission(pharmacist, PERMISSION_CODES.PRESCRIPTION_CREATE)).toBe(false);
  });

  it("should assign and revoke a role dynamically and record audit log", async () => {
    const nurse = await prisma.user.findUnique({ where: { username: "perawat_siti" } });
    const admin = await prisma.user.findUnique({ where: { username: "sysadmin" } });
    expect(nurse).toBeDefined();
    expect(admin).toBeDefined();

    // 1. Assign WARD_ADMIN to nurse
    const assignResult = await assignUserRole(nurse!.id, ROLE_CODES.WARD_ADMIN, admin!.id);
    expect(assignResult.success).toBe(true);

    // Verify role was added
    const updatedNurseAuth = await authenticateCredentials("perawat_siti", "demo12345");
    expect(updatedNurseAuth.user?.roles).toContain(ROLE_CODES.WARD_ADMIN);
    expect(updatedNurseAuth.user?.roles).toContain(ROLE_CODES.NURSE);

    // Check audit log
    const auditAssign = await prisma.auditLog.findFirst({
      where: {
        entityId: nurse!.id,
        action: "ASSIGN_ROLE",
      },
      orderBy: { createdAt: "desc" },
    });
    expect(auditAssign).toBeDefined();
    expect(auditAssign?.actorId).toBe(admin!.id);

    // 2. Revoke WARD_ADMIN from nurse
    const revokeResult = await revokeUserRole(nurse!.id, ROLE_CODES.WARD_ADMIN, admin!.id);
    expect(revokeResult.success).toBe(true);

    const revertedNurseAuth = await authenticateCredentials("perawat_siti", "demo12345");
    expect(revertedNurseAuth.user?.roles).not.toContain(ROLE_CODES.WARD_ADMIN);
    expect(revertedNurseAuth.user?.roles).toContain(ROLE_CODES.NURSE);

    // Check audit log
    const auditRevoke = await prisma.auditLog.findFirst({
      where: {
        entityId: nurse!.id,
        action: "REVOKE_ROLE",
      },
      orderBy: { createdAt: "desc" },
    });
    expect(auditRevoke).toBeDefined();
  });
});
