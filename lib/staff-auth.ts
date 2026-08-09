import { createHmac, timingSafeEqual } from "node:crypto";

export { hashPassword, verifyPassword } from "./portal-auth.ts";

export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

function secret(): string {
  const s = process.env.STAFF_SESSION_SECRET;
  if (!s) throw new Error("STAFF_SESSION_SECRET is not set");
  return s;
}

export function createStaffSessionToken(staffId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ staffId, exp: Date.now() + SESSION_TTL_SECONDS * 1000 }),
  ).toString("base64url");
  const sig = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyStaffSessionToken(token: string | undefined): { staffId: string } | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;

  const expected = createHmac("sha256", secret()).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof data.staffId !== "string" || Date.now() > data.exp) return null;
    return { staffId: data.staffId };
  } catch {
    return null;
  }
}
