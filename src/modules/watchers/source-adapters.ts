import sampleMessages from "@/fixtures/sample-messages.json";
import { env } from "@/src/config/env";
import { sha256 } from "@/src/lib/crypto";
import { logger } from "@/src/lib/logger";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";

export type SourceMessageEvent = {
  source: "zalo";
  groupExternalId: string;
  groupName?: string;
  messageExternalId?: string;
  senderExternalId?: string;
  senderName?: string;
  messageText: string;
  messageTime: string;
  rawPayload?: unknown;
};

export type SourceAdapter = {
  start(onEvent: (event: SourceMessageEvent) => Promise<void>): Promise<void>;
  stop(): Promise<void>;
};

export class MockAdapter implements SourceAdapter {
  async start(onEvent: (event: SourceMessageEvent) => Promise<void>) {
    for (const event of sampleMessages as SourceMessageEvent[]) {
      await onEvent(event);
    }
  }

  async stop() {}
}

type ConversationSnapshot = {
  animDataId: string;
  name: string | null;
  preview: string | null;
  timeLabel: string | null;
  unread: boolean;
};

function parsePreview(preview: string) {
  const separatorIndex = preview.indexOf(":");

  if (separatorIndex <= 0) {
    return {
      senderName: undefined,
      messageText: preview,
    };
  }

  return {
    senderName: preview.slice(0, separatorIndex).trim() || undefined,
    messageText: preview.slice(separatorIndex + 1).trim() || preview,
  };
}

export class PlaywrightConversationListAdapter implements SourceAdapter {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private knownSignatures = new Map<string, string>();

  async start(onEvent: (event: SourceMessageEvent) => Promise<void>) {
    await this.ensurePage();
    await this.poll(onEvent, true);

    this.pollTimer = setInterval(() => {
      this.poll(onEvent, false).catch((error) => {
        logger.warn("watcher_playwright_poll_failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, env.WATCHER_PLAYWRIGHT_POLL_INTERVAL_MS);
  }

  async stop() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async ensurePage() {
    if (this.page) {
      return this.page;
    }

    this.browser = await chromium.connectOverCDP(env.WATCHER_CDP_URL);
    this.context = this.browser.contexts()[0] ?? null;

    if (!this.context) {
      throw new Error("No browser context available on the remote Chromium instance");
    }

    this.page =
      this.context.pages().find((page) => page.url().startsWith(env.WATCHER_ZALO_URL)) ??
      this.context.pages()[0] ??
      null;

    if (!this.page) {
      this.page = await this.context.newPage();
    }

    if (!this.page.url().startsWith(env.WATCHER_ZALO_URL)) {
      await this.page.goto(env.WATCHER_ZALO_URL, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await this.page.waitForTimeout(5_000);
    }

    logger.info("watcher_playwright_attached", {
      cdpUrl: env.WATCHER_CDP_URL,
      url: this.page.url(),
      title: await this.page.title().catch(() => ""),
    });

    return this.page;
  }

  private async poll(onEvent: (event: SourceMessageEvent) => Promise<void>, isInitial: boolean) {
    const page = await this.ensurePage();
    const snapshots = await page.evaluate((limit) => {
      return Array.from(
        document.querySelectorAll<HTMLElement>('#conversationList .msg-item[data-id="div_TabMsg_ThrdChItem"]'),
      )
        .slice(0, limit)
        .map((item) => {
          const animDataId = item.getAttribute("anim-data-id");
          const name =
            item.querySelector(".conv-item-title__name .truncate")?.textContent?.replace(/\s+/g, " ").trim() ?? null;
          const messageNode = item.querySelector(".conv-item-body .conv-message");
          const preview = messageNode?.textContent?.replace(/\s+/g, " ").trim() ?? null;
          const timeLabel = item.querySelector(".preview-time")?.textContent?.replace(/\s+/g, " ").trim() ?? null;
          const unread = messageNode?.classList.contains("unread") ?? false;

          return {
            animDataId: animDataId ?? "",
            name,
            preview,
            timeLabel,
            unread,
          };
        });
    }, env.WATCHER_PLAYWRIGHT_VISIBLE_ITEM_LIMIT);

    for (const snapshot of snapshots as ConversationSnapshot[]) {
      if (!snapshot.animDataId || !snapshot.preview || !snapshot.name) {
        continue;
      }

      if (env.WATCHER_PLAYWRIGHT_GROUPS_ONLY && !snapshot.animDataId.startsWith("g")) {
        continue;
      }

      const signature = sha256(`${snapshot.animDataId}|${snapshot.preview}|${snapshot.timeLabel ?? ""}`);
      const previousSignature = this.knownSignatures.get(snapshot.animDataId);
      this.knownSignatures.set(snapshot.animDataId, signature);

      if (previousSignature === signature) {
        continue;
      }

      if (isInitial && !env.WATCHER_PLAYWRIGHT_EMIT_INITIAL_SNAPSHOT) {
        continue;
      }

      const parsedPreview = parsePreview(snapshot.preview);

      await onEvent({
        source: "zalo",
        groupExternalId: snapshot.animDataId,
        groupName: snapshot.name,
        messageExternalId: `${snapshot.animDataId}:${signature}`,
        senderName: parsedPreview.senderName,
        messageText: parsedPreview.messageText,
        messageTime: new Date().toISOString(),
        rawPayload: {
          adapter: "playwright_conversation_list",
          conversationId: snapshot.animDataId,
          conversationName: snapshot.name,
          preview: snapshot.preview,
          timeLabel: snapshot.timeLabel,
          unread: snapshot.unread,
        },
      });
    }
  }
}

export function createSourceAdapter(mode: "mock" | "adapter") {
  return mode === "mock" ? new MockAdapter() : new PlaywrightConversationListAdapter();
}
