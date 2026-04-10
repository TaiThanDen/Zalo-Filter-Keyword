import { PrismaClient } from "@prisma/client";
import { env } from "@/src/config/env";
import { hashPassword } from "@/src/lib/crypto";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await hashPassword(env.ADMIN_SEED_PASSWORD);

  const admin = await prisma.user.upsert({
    where: { email: env.ADMIN_SEED_EMAIL },
    update: {
      passwordHash,
      isActive: true,
    },
    create: {
      email: env.ADMIN_SEED_EMAIL,
      passwordHash,
    },
  });

  console.log(
    JSON.stringify({
      adminId: admin.id,
      email: admin.email,
    }),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
