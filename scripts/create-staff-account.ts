import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient, StaffRole } from "../app/generated/prisma/client.ts";
import { hashPassword } from "../lib/portal-auth.ts";

const VALID_ROLES = Object.values(StaffRole) as string[];

async function main() {
  const [, , name, email, password, warehouseName, roleArg] = process.argv;
  if (!name || !email || !password) {
    console.error(
      "Usage: npx tsx scripts/create-staff-account.ts <name> <email> <password> [warehouseName] [role]",
    );
    console.error(`role defaults to WAREHOUSE_MANAGER on first creation; one of: ${VALID_ROLES.join(", ")}`);
    process.exit(1);
  }

  if (roleArg && !VALID_ROLES.includes(roleArg)) {
    console.error(`Invalid role "${roleArg}". Must be one of: ${VALID_ROLES.join(", ")}`);
    process.exit(1);
  }
  if (roleArg === "SUPER_USER") {
    console.error("SUPER_USER has no warehouse — use scripts/create-super-user.ts instead.");
    process.exit(1);
  }
  const role = (roleArg as StaffRole | undefined) ?? "WAREHOUSE_MANAGER";

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
    create: {
      name,
      email,
      passwordHash: hashPassword(password),
      warehouseId: warehouse.id,
      accountId: warehouse.accountId,
      role,
    },
    update: { name, passwordHash: hashPassword(password), ...(roleArg ? { role } : {}) },
  });

  console.log(
    `Staff account ready: ${staff.name} <${staff.email}> (warehouse: ${warehouse.name}, role: ${staff.role}, id: ${staff.id})`,
  );
  await prisma.$disconnect();
}

main();
