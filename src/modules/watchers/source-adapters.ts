import sampleMessages from '@/fixtures/sample-messages.json';
import { env } from '@/src/config/env';
import { sha256 } from '@/src/lib/crypto';
import { logger } from '@/src/lib/logger';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';

export type SourceMessageEvent = {
  source: 'zalo';
  groupExternalId: string;
  groupName?: string;
  messageExternalId?: string;
  senderExternalId?: string;
  senderName?: string;
  messageText: string;
  messageTime: string;
  rawPayload?: unknown;
};

export type DiscoveredSourceGroup = {
  source: 'zalo';
  externalId: string;
  name: string;
};

export type SourceAdapter = {
  start(onEvent: (event: SourceMessageEvent) => Promise<void>): Promise<void>;
  stop(): Promise<void>;
  listGroups(): Promise<DiscoveredSourceGroup[]>;
};

export class MockAdapter implements SourceAdapter {
  async start(onEvent: (event: SourceMessageEvent) => Promise<void>) {
    for (const event of sampleMessages as SourceMessageEvent[]) {
      await onEvent(event);
    }
  }

  async stop() {}

  async listGroups() {
    const groups = new Map<string, DiscoveredSourceGroup>();

    for (const event of sampleMessages as SourceMessageEvent[]) {
      if (!event.groupExternalId) {
        continue;
      }

      groups.set(event.groupExternalId, {
        source: 'zalo',
        externalId: event.groupExternalId,
        name: event.groupName ?? event.groupExternalId,
      });
    }

    return Array.from(groups.values());
  }
}

type ConversationSnapshot = {
  animDataId: string;
  name: string | null;
  preview: string | null;
  timeLabel: string | null;
  unread: boolean;
};

type PersistedWatcherState = {
  knownSignatures: Record<string, string>;
};

type RawConversationSnapshot = {
  animDataId: string;
  nameRaw: string | null;
  previewRaw: string | null;
  timeLabelRaw: string | null;
  unread: boolean;
};

function parsePreview(preview: string) {
  const separatorIndex = preview.indexOf(':');

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

function normalizeMultilineText(value: string | null) {
  if (!value) {
    return null;
  }

  const normalized = value
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .trim();

  return normalized || null;
}

function normalizeSingleLineText(value: string | null) {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized || null;
}

function toConversationSnapshot(raw: RawConversationSnapshot): ConversationSnapshot {
  return {
    animDataId: raw.animDataId,
    name: normalizeSingleLineText(raw.nameRaw),
    preview: normalizeMultilineText(raw.previewRaw),
    timeLabel: normalizeSingleLineText(raw.timeLabelRaw),
    unread: raw.unread,
  };
}

function isRecentTimeLabel(timeLabel: string | null) {
  if (!timeLabel) {
    return false;
  }

  const normalized = timeLabel.toLowerCase().trim();

  if (!normalized) {
    return false;
  }

  if (normalized.includes('vừa xong') || normalized.includes('just now')) {
    return true;
  }

  const secondsMatch = normalized.match(/(\d+)\s*(giây|second|seconds|sec|s)/);
  if (secondsMatch) {
    return Number(secondsMatch[1]) <= 59;
  }

  const minutesMatch = normalized.match(/(\d+)\s*(phút|minute|minutes|min|m|p)/);
  if (minutesMatch) {
    return Number(minutesMatch[1]) <= 30;
  }

  const hoursMatch = normalized.match(/(\d+)\s*(giờ|hour|hours|hr|hrs|h)/);
  if (hoursMatch) {
    return Number(hoursMatch[1]) <= 12;
  }

  return false;
}

function getVietnamDateParts(date: Date) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const parts = formatter.formatToParts(date);
  const get = (type: 'year' | 'month' | 'day') => Number(parts.find((part) => part.type === type)?.value ?? '0');

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
  };
}

function buildVietnamIso(hours: number, minutes: number, now = new Date()) {
  const { year, month, day } = getVietnamDateParts(now);
  const utcHours = hours - 7;
  return new Date(Date.UTC(year, month - 1, day, utcHours, minutes, 0, 0)).toISOString();
}

function resolveMessageTime(timeLabel: string | null) {
  if (!timeLabel) {
    return new Date().toISOString();
  }

  const normalized = timeLabel.toLowerCase().trim();
  const now = new Date();

  if (!normalized || normalized.includes('vừa xong') || normalized.includes('just now')) {
    return now.toISOString();
  }

  const clockMatch = normalized.match(/^(\d{1,2})[:h](\d{1,2})$/);
  if (clockMatch) {
    const hours = Number(clockMatch[1]);
    const minutes = Number(clockMatch[2]);

    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return buildVietnamIso(hours, minutes, now);
    }
  }

  const minutesMatch = normalized.match(/(\d+)\s*(phút|minute|minutes|min|m|p)/);
  if (minutesMatch) {
    return new Date(now.getTime() - Number(minutesMatch[1]) * 60_000).toISOString();
  }

  const hoursMatch = normalized.match(/(\d+)\s*(giờ|hour|hours|hr|hrs|h)/);
  if (hoursMatch) {
    return new Date(now.getTime() - Number(hoursMatch[1]) * 60 * 60_000).toISOString();
  }

  const daysMatch = normalized.match(/(\d+)\s*(ngày|day|days|d)/);
  if (daysMatch) {
    return new Date(now.getTime() - Number(daysMatch[1]) * 24 * 60 * 60_000).toISOString();
  }

  if (normalized.includes('hôm qua') || normalized.includes('yesterday')) {
    return new Date(now.getTime() - 24 * 60 * 60_000).toISOString();
  }

  return now.toISOString();
}

const readVisibleSnapshotsFn = new Function(
  'rows',
  `
  return rows.map(function (item) {
    var row = item;
    var messageNode = row.querySelector('.conv-item-body .conv-message');
    var rawPreview = null;

    if (messageNode) {
      rawPreview = messageNode.innerText || messageNode.textContent || null;
    }

    var nameNode = row.querySelector('.conv-item-title__name .truncate');
    var timeNode = row.querySelector('.preview-time');

    return {
      animDataId: row.getAttribute('anim-data-id') || '',
      nameRaw: nameNode ? nameNode.textContent || null : null,
      previewRaw: rawPreview,
      timeLabelRaw: timeNode ? timeNode.textContent || null : null,
      unread: messageNode ? messageNode.classList.contains('unread') : false,
    };
  });
`,
) as (rows: Element[]) => RawConversationSnapshot[];

const readScrollTopFn = new Function('node', 'return node.scrollTop;') as (node: Element) => number;
const scrollConversationListFn = new Function(
  'node',
  "node.scrollTop = Math.min(node.scrollTop + Math.max(node.clientHeight * 0.85, 240), node.scrollHeight);",
) as (node: Element) => void;
const restoreScrollTopFn = new Function('node', 'scrollTop', 'node.scrollTop = scrollTop;') as (node: Element, scrollTop: number) => void;

export class PlaywrightConversationListAdapter implements SourceAdapter {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private knownSignatures = new Map<string, string>();
  private loadedPersistedState = false;

  async start(onEvent: (event: SourceMessageEvent) => Promise<void>) {
    await this.loadKnownSignatures();
    await this.ensurePage();
    await this.poll(onEvent, true);

    this.pollTimer = setInterval(() => {
      this.poll(onEvent, false).catch((error) => {
        logger.warn('watcher_playwright_poll_failed', {
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

    await this.persistKnownSignatures();
  }

  async listGroups() {
    const page = await this.ensurePage();
    const snapshots = await this.collectSnapshots(page, env.WATCHER_PLAYWRIGHT_GROUP_DISCOVERY_LIMIT);

    return snapshots
      .filter((snapshot) => snapshot.animDataId && snapshot.name)
      .filter((snapshot) => !env.WATCHER_PLAYWRIGHT_GROUPS_ONLY || snapshot.animDataId.startsWith('g'))
      .map((snapshot) => ({
        source: 'zalo' as const,
        externalId: snapshot.animDataId,
        name: snapshot.name ?? snapshot.animDataId,
      }));
  }

  private async ensurePage() {
    if (this.page) {
      return this.page;
    }

    this.browser = await chromium.connectOverCDP(env.WATCHER_CDP_URL);
    this.context = this.browser.contexts()[0] ?? null;

    if (!this.context) {
      throw new Error('No browser context available on the remote Chromium instance');
    }

    this.page =
      this.context.pages().find((page) => page.url().startsWith(env.WATCHER_ZALO_URL)) ??
      this.context.pages()[0] ??
      null;

    if (!this.page) {
      this.page = await this.context.newPage();
    }

    if (!this.page.url().startsWith(env.WATCHER_ZALO_URL)) {
      await this.page.goto(env.WATCHER_ZALO_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await this.page.waitForTimeout(5_000);
    }

    logger.info('watcher_playwright_attached', {
      cdpUrl: env.WATCHER_CDP_URL,
      url: this.page.url(),
      title: await this.page.title().catch(() => ''),
    });

    return this.page;
  }

  private async loadKnownSignatures() {
    try {
      const raw = await readFile(env.WATCHER_PLAYWRIGHT_STATE_FILE, 'utf8');
      const parsed = JSON.parse(raw) as PersistedWatcherState;

      if (!parsed.knownSignatures || typeof parsed.knownSignatures !== 'object') {
        return;
      }

      this.knownSignatures = new Map(Object.entries(parsed.knownSignatures));
      this.loadedPersistedState = true;
      logger.info('watcher_state_loaded', {
        stateFile: env.WATCHER_PLAYWRIGHT_STATE_FILE,
        entries: this.knownSignatures.size,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.warn('watcher_state_load_failed', {
          stateFile: env.WATCHER_PLAYWRIGHT_STATE_FILE,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private async persistKnownSignatures() {
    const state: PersistedWatcherState = {
      knownSignatures: Object.fromEntries(this.knownSignatures.entries()),
    };

    try {
      await mkdir(dirname(env.WATCHER_PLAYWRIGHT_STATE_FILE), { recursive: true });
      await writeFile(env.WATCHER_PLAYWRIGHT_STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
    } catch (error) {
      logger.warn('watcher_state_persist_failed', {
        stateFile: env.WATCHER_PLAYWRIGHT_STATE_FILE,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async readVisibleSnapshots(page: Page) {
    const rawSnapshots = (await page.$$eval(
      '#conversationList .msg-item[data-id="div_TabMsg_ThrdChItem"]',
      readVisibleSnapshotsFn,
    )) as RawConversationSnapshot[];

    return rawSnapshots.map(toConversationSnapshot);
  }

  private async collectSnapshots(page: Page, limit: number) {
    const snapshots = new Map<string, ConversationSnapshot>();
    const conversationList = page.locator('#conversationList');
    const hasConversationList = (await conversationList.count()) > 0;

    if (!hasConversationList) {
      return (await this.readVisibleSnapshots(page)).slice(0, limit);
    }

    const originalScrollTop = await conversationList.evaluate(readScrollTopFn);
    let previousCount = 0;
    let stablePasses = 0;
    const maxPasses = Math.max(8, Math.ceil(limit / 6) + 6);

    try {
      for (let pass = 0; pass < maxPasses && snapshots.size < limit; pass += 1) {
        const visibleSnapshots = await this.readVisibleSnapshots(page);

        for (const snapshot of visibleSnapshots) {
          if (snapshot.animDataId && !snapshots.has(snapshot.animDataId)) {
            snapshots.set(snapshot.animDataId, snapshot);
          }
        }

        if (snapshots.size === previousCount) {
          stablePasses += 1;
        } else {
          stablePasses = 0;
          previousCount = snapshots.size;
        }

        if (stablePasses >= 2) {
          break;
        }

        await conversationList.evaluate(scrollConversationListFn);
        await page.waitForTimeout(180);
      }
    } finally {
      await conversationList.evaluate(restoreScrollTopFn, originalScrollTop);
    }

    return Array.from(snapshots.values()).slice(0, limit);
  }

  private shouldEmitInitialSnapshot(snapshot: ConversationSnapshot) {
    if (snapshot.unread) {
      return true;
    }

    return isRecentTimeLabel(snapshot.timeLabel);
  }

  private async poll(onEvent: (event: SourceMessageEvent) => Promise<void>, isInitial: boolean) {
    const page = await this.ensurePage();
    const snapshots = await this.collectSnapshots(page, env.WATCHER_PLAYWRIGHT_VISIBLE_ITEM_LIMIT);
    let stateChanged = false;

    for (const snapshot of snapshots) {
      if (!snapshot.animDataId || !snapshot.preview || !snapshot.name) {
        continue;
      }

      if (env.WATCHER_PLAYWRIGHT_GROUPS_ONLY && !snapshot.animDataId.startsWith('g')) {
        continue;
      }

      const signature = sha256(`${snapshot.animDataId}|${snapshot.preview}`);
      const previousSignature = this.knownSignatures.get(snapshot.animDataId);

      if (previousSignature !== signature) {
        this.knownSignatures.set(snapshot.animDataId, signature);
        stateChanged = true;
      }

      if (previousSignature === signature) {
        continue;
      }

      if (isInitial) {
        if (!env.WATCHER_PLAYWRIGHT_EMIT_INITIAL_SNAPSHOT) {
          continue;
        }

        if (!this.loadedPersistedState && previousSignature === undefined && !this.shouldEmitInitialSnapshot(snapshot)) {
          continue;
        }
      }

      const parsedPreview = parsePreview(snapshot.preview);

      await onEvent({
        source: 'zalo',
        groupExternalId: snapshot.animDataId,
        groupName: snapshot.name,
        messageExternalId: `${snapshot.animDataId}:${signature}`,
        senderName: parsedPreview.senderName,
        messageText: parsedPreview.messageText,
        messageTime: resolveMessageTime(snapshot.timeLabel),
        rawPayload: {
          adapter: 'playwright_conversation_list',
          conversationId: snapshot.animDataId,
          conversationName: snapshot.name,
          preview: snapshot.preview,
          timeLabel: snapshot.timeLabel,
          unread: snapshot.unread,
        },
      });
    }

    if (stateChanged) {
      await this.persistKnownSignatures();
    }
  }
}

export function createSourceAdapter(mode: 'mock' | 'adapter') {
  return mode === 'mock' ? new MockAdapter() : new PlaywrightConversationListAdapter();
}
