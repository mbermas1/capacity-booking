This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Carrier Portal — Creating Carrier Accounts

Carriers log in to their own portal at `/portal` to view their bookings and book dock slots themselves. There's no self-registration — staff provision each carrier's login with a script, run from a checkout of this repo:

```bash
npx tsx scripts/create-carrier-account.ts "<carrier name>" "<email>" "<password>"
```

Example:

```bash
npx tsx scripts/create-carrier-account.ts "Acme Logistics" ops@acmelogistics.com "a-strong-password"
```

**Requirements:**
- Run from the project root, with `.env` present (needs `DATABASE_URL` and `PORTAL_SESSION_SECRET` — ask a maintainer if you don't have these).
- `npx tsx` downloads the `tsx` runner on first use; no separate install needed.

**Notes:**
- `<carrier name>` must **exactly match** the carrier name already used on that carrier's bookings (case-sensitive), so the new login attaches to their existing booking history instead of creating a duplicate, disconnected carrier record. Check `GET /api/bookings/carriers` if you're not sure of the exact spelling on file.
- The script is safe to re-run for an existing carrier — it updates the email/password rather than erroring, so re-running it is how you reset a carrier's password.
- There's currently no staff-auth system protecting this, which is exactly why it's a script you run yourself rather than a button in the app or an API endpoint anyone could call.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
