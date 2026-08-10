import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createSessionToken, verifyPassword, verifySessionToken, SESSION_TTL_SECONDS } from "@/lib/portal-auth";

export const PORTAL_SESSION_COOKIE = "portal_session";

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
