import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  createSessionToken,
  hashPassword,
  verifyPassword,
  verifySessionToken,
  SESSION_TTL_SECONDS,
} from "@/lib/portal-auth";
import { sendPasswordResetEmail } from "@/lib/email";

export const PORTAL_SESSION_COOKIE = "portal_session";
const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000; // matches booking-request verification's TTL

export async function getPortalSession() {
  const store = await cookies();
  return verifySessionToken(store.get(PORTAL_SESSION_COOKIE)?.value);
}

export async function getPortalUser() {
  const session = await getPortalSession();
  if (!session) return null;
  return prisma.carrierUser.findUnique({ where: { id: session.carrierUserId }, include: { carrier: true } });
}

export async function getPortalCarrier() {
  const user = await getPortalUser();
  return user?.carrier ?? null;
}

export async function requirePortalSession() {
  const session = await getPortalSession();
  if (!session) redirect("/portal/login");
  return session;
}

export async function authenticateCarrierUser(email: string, password: string) {
  const user = await prisma.carrierUser.findUnique({ where: { email } });
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return null;
  }
  return user;
}

export async function createPortalSession(carrierUserId: string) {
  const token = createSessionToken(carrierUserId);
  const store = await cookies();
  store.set(PORTAL_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

/** Never reveals whether the email exists — silently no-ops if it doesn't. */
export async function requestCarrierUserPasswordReset(email: string, resetBaseUrl: string): Promise<void> {
  const user = await prisma.carrierUser.findUnique({ where: { email } });
  if (!user) return;

  const token = randomBytes(16).toString("hex");
  await prisma.carrierUser.update({
    where: { id: user.id },
    data: { passwordResetToken: token, passwordResetExpiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS) },
  });

  await sendPasswordResetEmail(user.email, `${resetBaseUrl}/portal/reset-password?token=${token}`);
}

/** Returns the updated user row on success (so the caller can auto-login), or null if the token is invalid/expired. */
export async function resetCarrierUserPassword(token: string, newPassword: string) {
  const user = await prisma.carrierUser.findUnique({ where: { passwordResetToken: token } });
  if (!user || !user.passwordResetExpiresAt || user.passwordResetExpiresAt < new Date()) {
    return null;
  }

  return prisma.carrierUser.update({
    where: { id: user.id },
    data: { passwordHash: hashPassword(newPassword), passwordResetToken: null, passwordResetExpiresAt: null },
  });
}
