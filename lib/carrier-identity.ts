import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";

export function normalizeCarrierName(name: string): string {
  return name.trim().toLowerCase();
}

type CarrierClient = typeof prisma | Prisma.TransactionClient;

/** Finds a carrier by normalized name within an account, or creates a minimal new one. Never overwrites an existing row. */
export async function findOrCreateCarrierByName(
  client: CarrierClient,
  accountId: string,
  name: string,
  extra?: { email?: string },
) {
  const nameKey = normalizeCarrierName(name);
  return client.carrier.upsert({
    where: { accountId_nameKey: { accountId, nameKey } },
    create: { accountId, name: name.trim(), nameKey, ...extra },
    update: {},
  });
}
