import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createSessionToken, verifyPassword, verifySessionToken, SESSION_TTL_SECONDS } from "@/lib/portal-auth";

export const PORTAL_SESSION_COOKIE = "portal_session";

export async function getPortalSession() {
  const store = await cookies();
  return verifySessionToken(store.get(PORTAL_SESSION_COOKIE)?.value);
}

export async function getPortalCarrier() {
  const session = await getPortalSession();
  if (!session) return null;
  return prisma.carrier.findUnique({ where: { id: session.carrierId } });
}

export async function requirePortalSession() {
  const session = await getPortalSession();
  if (!session) redirect("/portal/login");
  return session;
}

export async function authenticateCarrier(email: string, password: string) {
  const carrier = await prisma.carrier.findUnique({ where: { email } });
  if (!carrier || !carrier.passwordHash || !verifyPassword(password, carrier.passwordHash)) {
    return null;
  }
  return carrier;
}

export async function createPortalSession(carrierId: string) {
  const token = createSessionToken(carrierId);
  const store = await cookies();
  store.set(PORTAL_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}
