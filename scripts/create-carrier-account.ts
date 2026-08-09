import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../app/generated/prisma/client.ts";
import { hashPassword } from "../lib/portal-auth.ts";

async function main() {
  const [, , name, email, password] = process.argv;
  if (!name || !email || !password) {
    console.error(
      "Usage: npx tsx scripts/create-carrier-account.ts <name> <email> <password>",
    );
    process.exit(1);
  }

  const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./dev.db" });
  const prisma = new PrismaClient({ adapter });

  const carrier = await prisma.carrier.upsert({
    where: { name },
    create: { name, email, passwordHash: hashPassword(password) },
    update: { email, passwordHash: hashPassword(password) },
  });

  console.log(`Carrier account ready: ${carrier.name} <${carrier.email}> (id: ${carrier.id})`);
  await prisma.$disconnect();
}

main();
