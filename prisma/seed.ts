import {
  ChannelType,
  MatchType,
  PrismaClient,
  RuleType,
  WatcherReportedStatus,
} from "@prisma/client";
import { env } from "@/src/config/env";
import { hashPassword, sha256 } from "@/src/lib/crypto";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await hashPassword(env.ADMIN_SEED_PASSWORD);

  const user = await prisma.user.upsert({
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

  const watcher = await prisma.watcher.upsert({
    where: { apiKeyHash: sha256(env.WATCHER_API_KEY) },
    update: {
      name: env.WATCHER_NODE_NAME,
      lastVersion: env.WATCHER_VERSION,
      reportedStatus: WatcherReportedStatus.OFFLINE,
    },
    create: {
      name: env.WATCHER_NODE_NAME,
      apiKeyHash: sha256(env.WATCHER_API_KEY),
      lastVersion: env.WATCHER_VERSION,
      reportedStatus: WatcherReportedStatus.OFFLINE,
    },
  });

  const rules = [
    { id: "include-pb", type: RuleType.INCLUDE, pattern: "PB", matchType: MatchType.CONTAINS },
    { id: "include-sup", type: RuleType.INCLUDE, pattern: "sup", matchType: MatchType.CONTAINS },
    { id: "include-mascot", type: RuleType.INCLUDE, pattern: "mascot", matchType: MatchType.CONTAINS },
    { id: "exclude-supplies", type: RuleType.EXCLUDE, pattern: "supplies", matchType: MatchType.WHOLE_WORD },
    { id: "exclude-test", type: RuleType.EXCLUDE, pattern: "test", matchType: MatchType.CONTAINS },
  ];

  for (const rule of rules) {
    await prisma.rule.upsert({
      where: { id: rule.id },
      update: {
        type: rule.type,
        pattern: rule.pattern,
        matchType: rule.matchType,
        isActive: true,
      },
      create: {
        id: rule.id,
        type: rule.type,
        pattern: rule.pattern,
        matchType: rule.matchType,
        isActive: true,
      },
    });
  }

  await prisma.notificationChannel.upsert({
    where: { id: "telegram-default" },
    update: {
      name: "Main Telegram Alert",
      type: ChannelType.TELEGRAM,
      isActive: false,
      config: {
        botToken: "replace_me",
        chatId: "replace_me",
      },
    },
    create: {
      id: "telegram-default",
      name: "Main Telegram Alert",
      type: ChannelType.TELEGRAM,
      isActive: false,
      config: {
        botToken: "replace_me",
        chatId: "replace_me",
      },
    },
  });

  console.log(
    JSON.stringify({
      seeded: true,
      userId: user.id,
      watcherId: watcher.id,
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
