import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  createStaffSessionToken,
  hashPassword,
  verifyPassword,
  verifyStaffSessionToken,
  SESSION_TTL_SECONDS,
} from "@/lib/staff-auth";
import { sendPasswordResetEmail } from "@/lib/email";

export const STAFF_SESSION_COOKIE = "staff_session";
const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000; // matches booking-request verification's TTL

export async function getStaffSession() {
  const store = await cookies();
  return verifyStaffSessionToken(store.get(STAFF_SESSION_COOKIE)?.value);
}

export async function getStaffMember() {
  const session = await getStaffSession();
  if (!session) return null;
  const staff = await prisma.staff.findUnique({
    where: { id: session.staffId },
    include: { warehouse: true, warehouseAccess: { include: { warehouse: true } } },
  });
  if (!staff) return null;

  // ANALYST scope is "every warehouse in my account", not hand-granted — synthesize the
  // same warehouseAccess shape WAREHOUSE_MANAGER/DOCK_MANAGER get from real StaffWarehouse rows.
  if (staff.role === "ANALYST" && staff.accountId) {
    const accountWarehouses = await prisma.warehouse.findMany({
      where: { accountId: staff.accountId, id: { not: staff.warehouseId ?? undefined } },
    });
    return {
      ...staff,
      warehouseAccess: accountWarehouses.map((warehouse) => ({
        staffId: staff.id,
        warehouseId: warehouse.id,
        createdAt: staff.createdAt,
        warehouse,
      })),
    };
  }

  return staff;
}

export async function requireStaffSession() {
  const session = await getStaffSession();
  if (!session) redirect("/staff/login");
  return session;
}

export async function authenticateStaff(email: string, password: string) {
  const staff = await prisma.staff.findUnique({ where: { email } });
  if (!staff || !verifyPassword(password, staff.passwordHash)) {
    return null;
  }
  return staff;
}

export async function createStaffSession(staffId: string) {
  const token = createStaffSessionToken(staffId);
  const store = await cookies();
  store.set(STAFF_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

/** Never reveals whether the email exists — silently no-ops if it doesn't. */
export async function requestStaffPasswordReset(email: string, resetBaseUrl: string): Promise<void> {
  const staff = await prisma.staff.findUnique({ where: { email } });
  if (!staff) return;

  const token = randomBytes(16).toString("hex");
  await prisma.staff.update({
    where: { id: staff.id },
    data: { passwordResetToken: token, passwordResetExpiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS) },
  });

  await sendPasswordResetEmail(staff.email, `${resetBaseUrl}/staff/reset-password?token=${token}`);
}

/** Returns the updated staff row on success (so the caller can auto-login), or null if the token is invalid/expired. */
export async function resetStaffPassword(token: string, newPassword: string) {
  const staff = await prisma.staff.findUnique({ where: { passwordResetToken: token } });
  if (!staff || !staff.passwordResetExpiresAt || staff.passwordResetExpiresAt < new Date()) {
    return null;
  }

  return prisma.staff.update({
    where: { id: staff.id },
    data: { passwordHash: hashPassword(newPassword), passwordResetToken: null, passwordResetExpiresAt: null },
  });
}
