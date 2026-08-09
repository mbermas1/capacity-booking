import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifySessionToken } from "@/lib/portal-auth";

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
