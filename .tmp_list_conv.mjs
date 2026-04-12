import { chromium } from 'playwright-core';
import { env } from './src/config/env.ts';

async function main() {
  const browser = await chromium.connectOverCDP(env.WATCHER_CDP_URL);
  const context = browser.contexts()[0];
  const page = context.pages().find((item) => item.url().startsWith(env.WATCHER_ZALO_URL)) ?? context.pages()[0];

  const snapshots = await page.$$eval('#conversationList .msg-item[data-id="div_TabMsg_ThrdChItem"]', (rows) => {
    return rows.map((item) => {
      const row = item;
      const messageNode = row.querySelector('.conv-item-body .conv-message');
      return {
        animDataId: row.getAttribute('anim-data-id') ?? '',
        name: row.querySelector('.conv-item-title__name .truncate')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
        preview: messageNode?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
        timeLabel: row.querySelector('.preview-time')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
      };
    });
  });

  console.log(JSON.stringify({ count: snapshots.length, snapshots }, null, 2));
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
