import { prisma } from "@/lib/prisma";
import { CARRIER_NAME_INCLUDE } from "@/lib/booking-response";
import type {
  BookingStatus,
  LoadType,
  Prisma,
} from "@/app/generated/prisma/client";

export class BookingOverlapError extends Error {
  constructor() {
    super("Booking overlaps an existing slot for this dock");
    this.name = "BookingOverlapError";
  }
}

export type CreateBookingInput = {
  dockId: string;
  startTime: Date;
  endTime: Date;
  carrierId: string;
  referenceNumber: string;
  loadType: LoadType;
  status?: BookingStatus;
};

export async function createBooking(input: CreateBookingInput) {
  const { dockId, startTime, endTime } = input;

  if (endTime <= startTime) {
    throw new Error("endTime must be after startTime");
  }

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const overlap = await tx.booking.findFirst({
      where: {
        dockId,
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
    });

    if (overlap) {
      throw new BookingOverlapError();
    }

    return tx.booking.create({ data: input, include: CARRIER_NAME_INCLUDE });
  });
}
