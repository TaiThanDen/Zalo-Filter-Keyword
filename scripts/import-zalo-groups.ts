import { PrismaClient } from '@prisma/client';
import { chromium } from 'playwright-core';
import { env } from '@/src/config/env';

const prisma = new PrismaClient();

type GroupSnapshot = {
  externalId: string;
  name: string;
};

async function ensurePage() {
  const browser = await chromium.connectOverCDP(env.WATCHER_CDP_URL);
  const context = browser.contexts()[0] ?? null;

  if (!context) {
    throw new Error('No browser context available on the remote Chromium instance');
  }

  const page =
    context.pages().find((item) => item.url().startsWith(env.WATCHER_ZALO_URL)) ??
    context.pages()[0] ??
    (await context.newPage());

  if (!page.url().startsWith(env.WATCHER_ZALO_URL)) {
    await page.goto(env.WATCHER_ZALO_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForTimeout(5_000);
  }

  return { browser, page };
}

async function collectGroups() {
  const { browser, page } = await ensurePage();

  try {
    const snapshots = new Map<string, GroupSnapshot>();
    let stablePasses = 0;
    let previousCount = 0;

    for (let pass = 0; pass < 24; pass += 1) {
      const items = (await page.evaluate(() => {
        const container = document.querySelector<HTMLElement>('#conversationList');
        const rows = Array.from(
          document.querySelectorAll<HTMLElement>('#conversationList .msg-item[data-id="div_TabMsg_ThrdChItem"]'),
        );

        const groups = rows
          .map((row) => {
            const externalId = row.getAttribute('anim-data-id') ?? '';
            const name =
              row.querySelector('.conv-item-title__name .truncate')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

            return { externalId, name };
          })
          .filter((item) => item.externalId.startsWith('g') && item.name);

        if (container) {
          container.scrollTop = Math.min(container.scrollTop + container.clientHeight * 0.9, container.scrollHeight);
        }

        return groups;
      })) as GroupSnapshot[];

      for (const item of items) {
        snapshots.set(item.externalId, item);
      }

      if (snapshots.size === previousCount) {
        stablePasses += 1;
      } else {
        stablePasses = 0;
        previousCount = snapshots.size;
      }

      if (stablePasses >= 3) {
        break;
      }

      await page.waitForTimeout(1200);
    }

    return Array.from(snapshots.values()).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  } finally {
    await browser.close();
  }
}

async function main() {
  const [watcher, rules] = await Promise.all([
    prisma.watcher.findFirst({
      where: { name: env.WATCHER_NODE_NAME },
    }),
    prisma.rule.findMany({ select: { id: true } }),
  ]);

  const groups = await collectGroups();
  let created = 0;
  let updated = 0;

  for (const group of groups) {
    const existing = await prisma.group.findUnique({
      where: {
        source_externalId: {
          source: 'zalo',
          externalId: group.externalId,
        },
      },
    });

    if (existing) {
      await prisma.group.update({
        where: { id: existing.id },
        data: {
          name: group.name,
          watcherId: existing.watcherId ?? watcher?.id ?? null,
        },
      });
      updated += 1;
      continue;
    }

    await prisma.$transaction(async (tx) => {
      const createdGroup = await tx.group.create({
        data: {
          source: 'zalo',
          externalId: group.externalId,
          name: group.name,
          isEnabled: true,
          watcherId: watcher?.id ?? null,
        },
      });

      if (rules.length > 0) {
        await tx.groupRule.createMany({
          data: rules.map((rule) => ({ groupId: createdGroup.id, ruleId: rule.id })),
          skipDuplicates: true,
        });
      }
    });
    created += 1;
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        watcherAssigned: watcher?.name ?? null,
        totalFound: groups.length,
        created,
        updated,
        autoAssignedRulesPerNewGroup: rules.length,
        sample: groups.slice(0, 10),
      },
      null,
      2,
    ),
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
