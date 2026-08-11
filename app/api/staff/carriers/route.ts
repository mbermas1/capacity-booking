import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStaffMember } from "@/lib/staff-session";
import { canManageCarrierAccounts } from "@/lib/staff-roles";
import { hashPassword } from "@/lib/portal-auth";
import { normalizeCarrierName } from "@/lib/carrier-identity";
import { PartnerType } from "@/app/generated/prisma/client";

type CreateCarrierAccountBody = {
  name?: unknown;
  notificationEmail?: unknown;
  contactName?: unknown;
  contactEmail?: unknown;
  password?: unknown;
  partnerType?: unknown;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function POST(request: NextRequest) {
  const staff = await getStaffMember();
  if (!staff) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!canManageCarrierAccounts(staff.role) || !staff.accountId) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
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
  if (!isNonEmptyString(body.contactName)) errors.push("contactName is required");
  if (!isNonEmptyString(body.contactEmail)) errors.push("contactEmail is required");
  if (!isNonEmptyString(body.password)) errors.push("password is required");
  if (body.notificationEmail !== undefined && !isNonEmptyString(body.notificationEmail)) {
    errors.push("notificationEmail must be a non-empty string if provided");
  }
  if (body.partnerType !== undefined && !Object.values(PartnerType).includes(body.partnerType as PartnerType)) {
    errors.push("partnerType must be one of: " + Object.values(PartnerType).join(", "));
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: "Validation failed", details: errors }, { status: 400 });
  }

  const name = (body.name as string).trim();
  const notificationEmail = isNonEmptyString(body.notificationEmail) ? body.notificationEmail.trim() : undefined;
  const contactName = (body.contactName as string).trim();
  const contactEmail = (body.contactEmail as string).trim();
  const passwordHash = hashPassword(body.password as string);
  const partnerType = body.partnerType as PartnerType | undefined;

  const nameKey = normalizeCarrierName(name);
  const carrier = await prisma.carrier.upsert({
    where: { accountId_nameKey: { accountId: staff.accountId, nameKey } },
    create: {
      accountId: staff.accountId,
      name,
      nameKey,
      email: notificationEmail,
      ...(partnerType !== undefined ? { partnerType } : {}),
    },
    update: { email: notificationEmail, ...(partnerType !== undefined ? { partnerType } : {}) },
  });

  const user = await prisma.carrierUser.upsert({
    where: { email: contactEmail },
    create: { carrierId: carrier.id, name: contactName, email: contactEmail, passwordHash, role: "ADMIN" },
    update: { name: contactName, passwordHash },
  });

  return NextResponse.json({
    carrier: { id: carrier.id, name: carrier.name, email: carrier.email, partnerType: carrier.partnerType },
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
}
