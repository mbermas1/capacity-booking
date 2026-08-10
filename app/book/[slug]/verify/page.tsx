import { redirect } from "next/navigation";
import { verifyBookingRequestEmail } from "@/lib/booking-requests";

export default async function VerifyBookingRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { slug } = await params;
  const { token } = await searchParams;

  if (!token) {
    redirect(`/book/${slug}?error=invalid-link`);
  }

  const result = await verifyBookingRequestEmail(token);

  if (result.outcome === "not_found") {
    redirect(`/book/${slug}?error=invalid-link`);
  }
  if (result.outcome === "expired") {
    redirect(`/book/${result.slug}?error=expired`);
  }
  if (result.outcome === "unavailable") {
    redirect(`/book/${result.slug}?error=unavailable`);
  }

  redirect(`/book/${result.slug}?submitted=${result.outcome}`);
}
