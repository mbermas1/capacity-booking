import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { createSessionToken, verifyPassword, SESSION_TTL_SECONDS } from "@/lib/portal-auth";
import { PORTAL_SESSION_COOKIE } from "@/lib/portal-session";

type LoginBody = {
  email?: unknown;
  password?: unknown;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function POST(request: NextRequest) {
  let body: LoginBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON" },
      { status: 400 },
    );
  }

  if (!isNonEmptyString(body.email) || !isNonEmptyString(body.password)) {
    return NextResponse.json(
      { error: "Validation failed", details: ["email and password are required"] },
      { status: 400 },
    );
  }

  const invalidCredentials = NextResponse.json(
    { error: "Invalid email or password" },
    { status: 401 },
  );

  const carrier = await prisma.carrier.findUnique({ where: { email: body.email.trim() } });
  if (!carrier || !carrier.passwordHash || !verifyPassword(body.password, carrier.passwordHash)) {
    return invalidCredentials;
  }

  const token = createSessionToken(carrier.id);
  const store = await cookies();
  store.set(PORTAL_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });

  return NextResponse.json({ carrier: { id: carrier.id, name: carrier.name, email: carrier.email } });
}
