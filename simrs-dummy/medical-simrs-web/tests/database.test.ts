import { describe, it, expect, afterAll } from "vitest";
import prisma from "@/lib/prisma";

describe("Slice 1: Database & Model Verification", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("should successfully connect to the PostgreSQL database", async () => {
    const result = await prisma.$queryRaw<Array<{ connected: number }>>`SELECT 1 as connected`;
    expect(result).toBeDefined();
    expect(result[0].connected).toBe(1);
  });

  it("should have all 7 baseline roles initialized in database", async () => {
    const roles = await prisma.role.findMany();
    const roleCodes = roles.map((r) => r.code);

    expect(roleCodes).toContain("SYSTEM_ADMIN");
    expect(roleCodes).toContain("SIMRS_ADMIN");
    expect(roleCodes).toContain("DOCTOR");
    expect(roleCodes).toContain("NURSE");
    expect(roleCodes).toContain("PHARMACIST");
    expect(roleCodes).toContain("PHARMACY_STAFF");
    expect(roleCodes).toContain("WARD_ADMIN");
  });

  it("should verify multi-role user has multiple distinct roles", async () => {
    const user = await prisma.user.findUnique({
      where: { username: "multirole_user" },
      include: {
        userRoles: {
          include: {
            role: true,
          },
        },
      },
    });

    expect(user).toBeDefined();
    expect(user?.userRoles.length).toBe(2);

    const assignedRoleCodes = user?.userRoles.map((ur) => ur.role.code);
    expect(assignedRoleCodes).toContain("DOCTOR");
    expect(assignedRoleCodes).toContain("PHARMACIST");
  });

  it("should have stable room_code for rooms in master data", async () => {
    const melatiRoom = await prisma.room.findUnique({
      where: { roomCode: "R-MELATI-101" },
    });

    expect(melatiRoom).toBeDefined();
    expect(melatiRoom?.roomCode).toBe("R-MELATI-101");
  });

  it("should ensure all demo patients are labeled synthetic", async () => {
    const patients = await prisma.patient.findMany();
    expect(patients.length).toBeGreaterThan(0);
    for (const patient of patients) {
      expect(patient.isSynthetic).toBe(true);
    }
  });
});
