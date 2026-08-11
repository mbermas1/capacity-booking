import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requestCarrierUserPasswordReset } from "@/lib/portal-session";

async function requestReset(formData: FormData) {
  "use server";

  const email = String(formData.get("email") ?? "").trim();

  if (email) {
    const requestHeaders = await headers();
    const host = requestHeaders.get("host") ?? "localhost:3000";
    const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
    await requestCarrierUserPasswordReset(email, `${protocol}://${host}`);
  }

  redirect("/portal/forgot-password?sent=1");
}

export default async function PortalForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const { sent } = await searchParams;

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="w-full max-w-sm rounded-2xl border border-black/[.08] bg-white p-8 dark:border-white/[.145] dark:bg-[#0a0a0a]">
        <h1 className="mb-6 text-xl font-semibold text-black dark:text-zinc-50">Reset Your Password</h1>

        {sent ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            If that email belongs to a portal account, we&rsquo;ve sent a link to reset the password. The link
            expires in 30 minutes.
          </p>
        ) : (
          <form action={requestReset} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="email" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className="h-10 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
              />
            </div>
            <button
              type="submit"
              className="mt-2 h-10 rounded-full bg-foreground text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
            >
              Send Reset Link
            </button>
          </form>
        )}

        <Link href="/portal/login" className="mt-4 block text-sm text-zinc-500 hover:underline dark:text-zinc-400">
          ← Back to login
        </Link>
      </main>
    </div>
  );
}
