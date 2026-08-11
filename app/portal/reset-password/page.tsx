import Link from "next/link";
import { redirect } from "next/navigation";
import { resetCarrierUserPassword, createPortalSession } from "@/lib/portal-session";

async function submitReset(token: string, formData: FormData) {
  "use server";

  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!password || password !== confirmPassword) {
    redirect(`/portal/reset-password?token=${token}&error=mismatch`);
  }

  const user = await resetCarrierUserPassword(token, password);
  if (!user) {
    redirect(`/portal/reset-password?token=${token}&error=invalid`);
  }

  await createPortalSession(user.id);
  redirect("/portal");
}

export default async function PortalResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;

  if (!token) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <main className="w-full max-w-sm rounded-2xl border border-black/[.08] bg-white p-8 dark:border-white/[.145] dark:bg-[#0a0a0a]">
          <h1 className="mb-2 text-xl font-semibold text-black dark:text-zinc-50">Invalid Link</h1>
          <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">This reset link is missing its token.</p>
          <Link href="/portal/forgot-password" className="text-sm text-zinc-500 hover:underline dark:text-zinc-400">
            Request a new link
          </Link>
        </main>
      </div>
    );
  }

  const boundSubmit = submitReset.bind(null, token);

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="w-full max-w-sm rounded-2xl border border-black/[.08] bg-white p-8 dark:border-white/[.145] dark:bg-[#0a0a0a]">
        <h1 className="mb-6 text-xl font-semibold text-black dark:text-zinc-50">Set a New Password</h1>

        {error === "invalid" && (
          <p className="mb-4 rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-300">
            This link is invalid or has expired.{" "}
            <Link href="/portal/forgot-password" className="underline">
              Request a new one
            </Link>
            .
          </p>
        )}
        {error === "mismatch" && (
          <p className="mb-4 rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-300">
            Passwords didn&rsquo;t match. Try again.
          </p>
        )}

        <form action={boundSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="password" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              New Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              className="h-10 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="confirmPassword" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              required
              className="h-10 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            />
          </div>
          <button
            type="submit"
            className="mt-2 h-10 rounded-full bg-foreground text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            Set Password
          </button>
        </form>
      </main>
    </div>
  );
}
