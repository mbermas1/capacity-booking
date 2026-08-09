import { NextRequest, NextResponse } from "next/server";
import { authenticateCarrier, createPortalSession } from "@/lib/portal-session";

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

  const carrier = await authenticateCarrier(body.email.trim(), body.password);
  if (!carrier) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  await createPortalSession(carrier.id);

  return NextResponse.json({ carrier: { id: carrier.id, name: carrier.name, email: carrier.email } });
}
