import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();
const since = new Date(Date.now() - 1000 * 60 * 15);

async function main() {
  const inbound = await db.inboundMessage.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      groupExternalId: true,
      messageExternalId: true,
      normalizedText: true,
      createdAt: true,
    },
  });

  const matches = await db.matchLog.findMany({
    where: { processedAt: { gte: since } },
    orderBy: { processedAt: 'desc' },
    take: 20,
    select: {
      decision: true,
      reason: true,
      processedAt: true,
      inboundMessage: {
        select: {
          groupExternalId: true,
          messageExternalId: true,
          normalizedText: true,
        },
      },
    },
  });

  const deliveries = await db.notificationDelivery.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      status: true,
      attempts: true,
      createdAt: true,
      sentAt: true,
      payload: true,
    },
  });

  console.log(JSON.stringify({ inbound, matches, deliveries }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await db.$disconnect();
});
