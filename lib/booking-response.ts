import type { Booking } from "@/app/generated/prisma/client";

export const CARRIER_NAME_INCLUDE = { carrier: { select: { name: true } } } as const;

export function withCarrierName<T extends Booking & { carrier: { name: string } }>(booking: T) {
  const { carrier, ...rest } = booking;
  return { ...rest, carrierName: carrier.name };
}
