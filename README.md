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

Carriers log in to their own portal at `/portal` to view their bookings and book dock slots themselves. Staff manage carrier logins in-app at **`/staff`** — no CLI needed for this day to day. There's still no self-registration for carriers; a staff member always provisions the account first.

At `/staff`, a logged-in staff member can:
- Create a new carrier account (name, email, password)
- Reset an existing carrier's email/password — submitting with a carrier name that already exists updates that account instead of creating a duplicate, so this doubles as the "forgot password" flow
- See every carrier, their booking count, and whether a login is set up yet

**The carrier name must exactly match** the name already used on that carrier's bookings (case-sensitive) for a reset to attach to their existing history rather than creating a disconnected duplicate — the form's name field autocompletes from existing carriers to help avoid typos.

### Staff Accounts

Staff accounts have no self-registration either, and (unlike carriers) there's currently no in-app way for one staff member to create another — so the first staff account, and any additional ones, are created with a bootstrap script:

```bash
npx tsx scripts/create-staff-account.ts "<name>" "<email>" "<password>"
```

Example:

```bash
npx tsx scripts/create-staff-account.ts "Jordan Lee" jordan@yourcompany.com "a-strong-password"
```

Requires `.env` to be present with `DATABASE_URL` and `STAFF_SESSION_SECRET` set (ask a maintainer if you don't have these). Safe to re-run — it upserts by email, so re-running it for an existing address resets that person's name/password.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
