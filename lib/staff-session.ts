import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  createStaffSessionToken,
  verifyPassword,
  verifyStaffSessionToken,
  SESSION_TTL_SECONDS,
} from "@/lib/staff-auth";

export const STAFF_SESSION_COOKIE = "staff_session";

export async function getStaffSession() {
  const store = await cookies();
  return verifyStaffSessionToken(store.get(STAFF_SESSION_COOKIE)?.value);
}

export async function getStaffMember() {
  const session = await getStaffSession();
  if (!session) return null;
  return prisma.staff.findUnique({ where: { id: session.staffId } });
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
