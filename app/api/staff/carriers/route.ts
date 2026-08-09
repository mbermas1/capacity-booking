import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStaffSession } from "@/lib/staff-session";
import { hashPassword } from "@/lib/portal-auth";

type CreateCarrierAccountBody = {
  name?: unknown;
  email?: unknown;
  password?: unknown;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function POST(request: NextRequest) {
  const session = await getStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: CreateCarrierAccountBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON" },
      { status: 400 },
    );
  }

  const errors: string[] = [];
  if (!isNonEmptyString(body.name)) errors.push("name is required");
  if (!isNonEmptyString(body.email)) errors.push("email is required");
  if (!isNonEmptyString(body.password)) errors.push("password is required");

  if (errors.length > 0) {
    return NextResponse.json({ error: "Validation failed", details: errors }, { status: 400 });
  }

  const name = (body.name as string).trim();
  const email = (body.email as string).trim();
  const passwordHash = hashPassword(body.password as string);

  const carrier = await prisma.carrier.upsert({
    where: { name },
    create: { name, email, passwordHash },
    update: { email, passwordHash },
  });

  return NextResponse.json({ id: carrier.id, name: carrier.name, email: carrier.email });
}
