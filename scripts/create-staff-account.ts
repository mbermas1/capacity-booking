import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../app/generated/prisma/client.ts";
import { hashPassword } from "../lib/portal-auth.ts";

async function main() {
  const [, , name, email, password, warehouseName] = process.argv;
  if (!name || !email || !password) {
    console.error(
      "Usage: npx tsx scripts/create-staff-account.ts <name> <email> <password> [warehouseName]",
    );
    process.exit(1);
  }

  const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./dev.db" });
  const prisma = new PrismaClient({ adapter });

  const warehouse = warehouseName
    ? await prisma.warehouse.findFirst({ where: { name: warehouseName } })
    : await prisma.warehouse.findFirst({ orderBy: { createdAt: "asc" } });

  if (!warehouse) {
    console.error(
      warehouseName
        ? `No warehouse named "${warehouseName}" found.`
        : "No warehouse exists yet — run migrations first.",
    );
    process.exit(1);
  }

  const staff = await prisma.staff.upsert({
    where: { email },
    create: { name, email, passwordHash: hashPassword(password), warehouseId: warehouse.id },
    update: { name, passwordHash: hashPassword(password) },
  });

  console.log(`Staff account ready: ${staff.name} <${staff.email}> (warehouse: ${warehouse.name}, id: ${staff.id})`);
  await prisma.$disconnect();
}

main();
