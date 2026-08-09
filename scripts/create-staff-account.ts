import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../app/generated/prisma/client.ts";
import { hashPassword } from "../lib/portal-auth.ts";

async function main() {
  const [, , name, email, password] = process.argv;
  if (!name || !email || !password) {
    console.error(
      "Usage: npx tsx scripts/create-staff-account.ts <name> <email> <password>",
    );
    process.exit(1);
  }

  const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./dev.db" });
  const prisma = new PrismaClient({ adapter });

  const staff = await prisma.staff.upsert({
    where: { email },
    create: { name, email, passwordHash: hashPassword(password) },
    update: { name, passwordHash: hashPassword(password) },
  });

  console.log(`Staff account ready: ${staff.name} <${staff.email}> (id: ${staff.id})`);
  await prisma.$disconnect();
}

main();
