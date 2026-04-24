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
  categoryKey?: ConversationCategoryKey | null;
};

export type StoredGroupCandidate = {
  externalId: string;
  lastReceiveTs: number | null;
  isArchived: boolean;
};

type PersistedWatcherState = {
  knownSignatures: Record<string, string>;
  knownGroupNames?: Record<string, string>;
};

type RawConversationSnapshot = {
  animDataId: string;
  nameRaw: string | null;
  previewRaw: string | null;
  timeLabelRaw: string | null;
  unread: boolean;
};

export type ZaloPageCandidate<TPage = unknown> = {
  page: TPage;
  index: number;
  url: string;
  title: string;
  rowCount: number;
  hasComposer: boolean;
  activationPrompt: boolean;
};

export type ConversationCategoryKey = 'priority' | 'other';

type ConversationMessageDetails = {
  messageText: string | null;
  senderName?: string;
};

type ConversationCategoryDomItem = {
  key: ConversationCategoryKey;
  label: string;
  active: boolean;
};

const LAST_RECEIVE_TS_KEY = /^0_(g[^_]+)_lastReceiveTs$/;
const ARCHIVED_CHAT_KEY_SUFFIX = '__archived_chat';
const WATCHER_MANAGED_PAGE_SESSION_KEY = '__zalo_watcher_managed';
const WATCHER_CONTENT_DEDUPE_WINDOW_MS = 120_000;
const CONVERSATION_CATEGORY_SCAN_ORDER: ConversationCategoryKey[] = ['other', 'priority'];

const CONVERSATION_CATEGORY_LABELS: Record<ConversationCategoryKey, string[]> = {
  priority: ['\u01afu ti\u00ean', 'Uu tien', 'Priority'],
  other: ['Kh\u00e1c', 'Khac', 'Other'],
};

function normalizeSearchLabel(value: string | null) {
  if (!value) {
    return '';
  }

  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function normalizeConversationCategoryLabel(value: string | null) {
  const normalized = normalizeSearchLabel(value);

  if (!normalized) {
    return null;
  }

  if (CONVERSATION_CATEGORY_LABELS.other.some((label) => normalizeSearchLabel(label) === normalized)) {
    return 'other';
  }

  if (CONVERSATION_CATEGORY_LABELS.priority.some((label) => normalizeSearchLabel(label) === normalized)) {
    return 'priority';
  }

  return null;
}

export function sortConversationCategoriesForScan(categories: ConversationCategoryKey[]) {
  return CONVERSATION_CATEGORY_SCAN_ORDER.filter((key, index, order) => {
    return categories.includes(key) && order.indexOf(key) === index;
  });
}

function buildConversationSignature(input: { conversationId: string; preview: string; lastReceiveTs: number | null }) {
  return sha256(`${input.conversationId}|${input.lastReceiveTs ?? 'no-last-receive-ts'}|${input.preview}`);
}

function normalizeMessageFingerprintText(value: string) {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}

function buildMessageContentSignature(input: { senderName?: string; messageText: string }) {
  const senderIdentity = normalizeSearchLabel(input.senderName ?? 'unknown_sender');
  const messageIdentity = normalizeMessageFingerprintText(input.messageText);
  return sha256(`${senderIdentity}|${messageIdentity}`);
}

function isRecoverablePlaywrightError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  return [
    'Target page, context or browser has been closed',
    'browser has been closed',
    'Browser closed',
    'Session closed',
    'Protocol error',
    'ECONNREFUSED',
  ].some((pattern) => message.includes(pattern));
}

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

function normalizePreservedMessageText(value: string | null) {
  if (!value) {
    return null;
  }

  const normalized = value
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

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

export function choosePreferredZaloPage<TPage>(candidates: ZaloPageCandidate<TPage>[]) {
  if (candidates.length === 0) {
    return null;
  }

  return [...candidates].sort((left, right) => {
    if (left.activationPrompt !== right.activationPrompt) {
      return Number(left.activationPrompt) - Number(right.activationPrompt);
    }

    if (left.rowCount !== right.rowCount) {
      return right.rowCount - left.rowCount;
    }

    if (left.hasComposer !== right.hasComposer) {
      return Number(right.hasComposer) - Number(left.hasComposer);
    }

    return left.index - right.index;
  })[0];
}

function safeParseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

export function parseStoredGroupCandidates(localStorageEntries: Array<[string, string]>): StoredGroupCandidate[] {
  const groups = new Map<string, StoredGroupCandidate>();

  for (const [key, value] of localStorageEntries) {
    const lastReceiveTsMatch = key.match(LAST_RECEIVE_TS_KEY);

    if (lastReceiveTsMatch) {
      const externalId = lastReceiveTsMatch[1];
      const parsedTs = Number(value);
      const current = groups.get(externalId);

      groups.set(externalId, {
        externalId,
        lastReceiveTs: Number.isFinite(parsedTs) ? parsedTs : current?.lastReceiveTs ?? null,
        isArchived: current?.isArchived ?? false,
      });
      continue;
    }

    if (!key.endsWith(ARCHIVED_CHAT_KEY_SUFFIX)) {
      continue;
    }

    const parsed = safeParseJson(value);
    if (!Array.isArray(parsed)) {
      continue;
    }

    for (const item of parsed) {
      if (!item || typeof item !== 'object') {
        continue;
      }

      const externalId = typeof (item as { id?: unknown }).id === 'string' ? (item as { id: string }).id : null;
      if (!externalId?.startsWith('g')) {
        continue;
      }

      const current = groups.get(externalId);
      groups.set(externalId, {
        externalId,
        lastReceiveTs: current?.lastReceiveTs ?? null,
        isArchived: true,
      });
    }
  }

  return Array.from(groups.values()).sort((left, right) => {
    const leftTs = left.lastReceiveTs ?? Number.NEGATIVE_INFINITY;
    const rightTs = right.lastReceiveTs ?? Number.NEGATIVE_INFINITY;

    if (rightTs !== leftTs) {
      return rightTs - leftTs;
    }

    if (left.isArchived !== right.isArchived) {
      return Number(left.isArchived) - Number(right.isArchived);
    }

    return left.externalId.localeCompare(right.externalId);
  });
}

export function mergeDiscoveredGroups(input: {
  visibleSnapshots: ConversationSnapshot[];
  storedGroups: StoredGroupCandidate[];
  knownGroupNames?: Record<string, string>;
  limit: number;
  groupsOnly: boolean;
}): DiscoveredSourceGroup[] {
  const groups = new Map<string, DiscoveredSourceGroup>();

  for (const snapshot of input.visibleSnapshots) {
    if (!snapshot.animDataId) {
      continue;
    }

    if (input.groupsOnly && !snapshot.animDataId.startsWith('g')) {
      continue;
    }

    const resolvedName = snapshot.name ?? input.knownGroupNames?.[snapshot.animDataId] ?? snapshot.animDataId;
    groups.set(snapshot.animDataId, {
      source: 'zalo',
      externalId: snapshot.animDataId,
      name: resolvedName,
    });
  }

  for (const storedGroup of input.storedGroups) {
    if (input.groupsOnly && !storedGroup.externalId.startsWith('g')) {
      continue;
    }

    if (groups.has(storedGroup.externalId)) {
      continue;
    }

    const cachedName = input.knownGroupNames?.[storedGroup.externalId]?.trim();

    groups.set(storedGroup.externalId, {
      source: 'zalo',
      externalId: storedGroup.externalId,
      name: cachedName || storedGroup.externalId,
    });
  }

  return Array.from(groups.values()).slice(0, input.limit);
}

const readVisibleSnapshotsFn = new Function(
  'rows',
  `
  return rows.map(function (item) {
    var row = item;
    var previewRoot =
      row.querySelector('.conv-item-body') ||
      row.querySelector('.conv-item-body__main') ||
      row.querySelector('.z-conv-message__preview-message') ||
      row.querySelector('.z-conv-message') ||
      row.querySelector('.conv-message');
    var rawPreview = null;

    if (previewRoot) {
      rawPreview = previewRoot.innerText || previewRoot.textContent || null;
    }

    var nameNode = row.querySelector('.conv-item-title__name .truncate');
    var timeNode = row.querySelector('.preview-time');
    var unreadNode =
      row.querySelector('.count_unread') ||
      row.querySelector('.badge') ||
      row.querySelector('[class*="unread"]');

    return {
      animDataId: row.getAttribute('anim-data-id') || '',
      nameRaw: nameNode ? nameNode.textContent || null : null,
      previewRaw: rawPreview,
      timeLabelRaw: timeNode ? timeNode.textContent || null : null,
      unread: Boolean(unreadNode),
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
  private browserTaskQueue: Promise<void> = Promise.resolve();
  private stopped = false;
  private knownSignatures = new Map<string, string>();
  private knownGroupNames = new Map<string, string>();
  private recentContentSignatures = new Map<string, number>();
  private loadedPersistedState = false;

  async start(onEvent: (event: SourceMessageEvent) => Promise<void>) {
    this.stopped = false;
    await this.loadPersistedState();
    await this.runPollCycle(onEvent, true);
  }

  async stop() {
    this.stopped = true;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    await this.resetBrowserState('adapter_stop');
    await this.persistState();
  }

  async listGroups() {
    return this.runSerialized(async () =>
      this.withRecoveredBrowser('list_groups', async () => {
        const page = await this.ensurePage();
        const [snapshots, storedGroups] = await Promise.all([
          this.collectSnapshots(page, env.WATCHER_PLAYWRIGHT_GROUP_DISCOVERY_LIMIT),
          this.readStoredGroupCandidates(page),
        ]);
        const namesChanged = this.rememberSnapshotNames(snapshots);
        const groups = mergeDiscoveredGroups({
          visibleSnapshots: snapshots,
          storedGroups,
          knownGroupNames: Object.fromEntries(this.knownGroupNames.entries()),
          limit: env.WATCHER_PLAYWRIGHT_GROUP_DISCOVERY_LIMIT,
          groupsOnly: env.WATCHER_PLAYWRIGHT_GROUPS_ONLY,
        });

        if (namesChanged) {
          await this.persistState();
        }

        logger.info('watcher_playwright_group_discovery_completed', {
          visibleSnapshots: snapshots.length,
          storedGroups: storedGroups.length,
          totalGroups: groups.length,
        });

        return groups;
      }),
    );
  }

  private async ensurePage() {
    if (!this.browser || !this.browser.isConnected()) {
      await this.resetBrowserState('browser_not_connected');
      this.browser = await chromium.connectOverCDP(env.WATCHER_CDP_URL);
      this.browser.on('disconnected', () => {
        this.page = null;
        this.context = null;
        this.browser = null;
        logger.warn('watcher_playwright_browser_disconnected');
      });
    }

    if (!this.context) {
      this.context = this.browser.contexts()[0] ?? null;
    }

    if (!this.context) {
      throw new Error('No browser context available on the remote Chromium instance');
    }

    if (this.page && !this.page.isClosed()) {
      if (!this.page.url().startsWith(env.WATCHER_ZALO_URL)) {
        await this.page.goto(env.WATCHER_ZALO_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
        await this.page.waitForTimeout(5_000);
      }

      await this.markWatcherManagedPage(this.page);
      return this.page;
    }

    const existingZaloPages = this.context.pages().filter((page) => page.url().startsWith(env.WATCHER_ZALO_URL));

    if (existingZaloPages.length > 0) {
      const pageCandidates = await Promise.all(existingZaloPages.map((page, index) => this.buildPageCandidate(page, index)));
      const managedCandidates = (
        await Promise.all(
          pageCandidates.map(async (candidate) => ({
            candidate,
            isManaged: await this.isWatcherManagedPage(candidate.page),
          })),
        )
      )
        .filter((item) => item.isManaged)
        .map((item) => item.candidate);
      const preferredPage = choosePreferredZaloPage(managedCandidates);

      if (preferredPage) {
        this.page = preferredPage.page;
        logger.info('watcher_playwright_page_selected', {
          selectedIndex: preferredPage.index,
          selectedRowCount: preferredPage.rowCount,
          selectedHasComposer: preferredPage.hasComposer,
          selectedActivationPrompt: preferredPage.activationPrompt,
          totalZaloPages: pageCandidates.length,
          selectionSource: 'managed_page',
        });
      } else {
        this.page = await this.createManagedPage();
        logger.info('watcher_playwright_page_selected', {
          selectedIndex: -1,
          selectedRowCount: 0,
          selectedHasComposer: false,
          selectedActivationPrompt: false,
          totalZaloPages: pageCandidates.length,
          selectionSource: 'created_managed_page',
        });
      }
    } else {
      this.page = await this.createManagedPage();
    }

    if (!this.page) {
      throw new Error('No Zalo page available on the remote Chromium instance');
    }

    if (!this.page.url().startsWith(env.WATCHER_ZALO_URL)) {
      await this.page.goto(env.WATCHER_ZALO_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await this.page.waitForTimeout(5_000);
    }

    await this.markWatcherManagedPage(this.page);

    logger.info('watcher_playwright_attached', {
      cdpUrl: env.WATCHER_CDP_URL,
      url: this.page.url(),
      title: await this.page.title().catch(() => ''),
    });

    return this.page;
  }

  private async createManagedPage() {
    if (!this.context) {
      throw new Error('No browser context available on the remote Chromium instance');
    }

    const page = await this.context.newPage();
    await page.goto(env.WATCHER_ZALO_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForTimeout(5_000);
    await this.markWatcherManagedPage(page);
    return page;
  }

  private async resetBrowserState(reason: string) {
    const browser = this.browser;

    this.page = null;
    this.context = null;
    this.browser = null;

    if (browser) {
      browser.removeAllListeners();
    }

    logger.warn('watcher_playwright_browser_reset', { reason });
  }

  private async withRecoveredBrowser<T>(operation: string, task: () => Promise<T>): Promise<T> {
    try {
      return await task();
    } catch (error) {
      if (!isRecoverablePlaywrightError(error)) {
        throw error;
      }

      logger.warn('watcher_playwright_browser_recovering', {
        operation,
        error: error instanceof Error ? error.message : String(error),
      });
      await this.resetBrowserState(`recover:${operation}`);
      return task();
    }
  }

  private async runSerialized<T>(task: () => Promise<T>) {
    const run = this.browserTaskQueue.then(task, task);
    this.browserTaskQueue = run.then(() => undefined, () => undefined);
    return run;
  }

  private scheduleNextPoll(onEvent: (event: SourceMessageEvent) => Promise<void>) {
    if (this.stopped) {
      return;
    }

    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
    }

    this.pollTimer = setTimeout(() => {
      void this.runPollCycle(onEvent, false);
    }, env.WATCHER_PLAYWRIGHT_POLL_INTERVAL_MS);
  }

  private async runPollCycle(onEvent: (event: SourceMessageEvent) => Promise<void>, isInitial: boolean) {
    try {
      await this.runSerialized(() => this.withRecoveredBrowser('poll', () => this.poll(onEvent, isInitial)));
    } catch (error) {
      logger.warn('watcher_playwright_poll_failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.scheduleNextPoll(onEvent);
    }
  }

  private async buildPageCandidate(page: Page, index: number) {
    const bodyText = await page
      .locator('body')
      .innerText()
      .then((value) => value.slice(0, 300))
      .catch(() => '');

    const rowCount = await page
      .locator('#conversationList .msg-item[data-id="div_TabMsg_ThrdChItem"]')
      .count()
      .catch(() => 0);

    const hasComposer =
      (await page
        .locator('#richInput')
        .count()
        .catch(() => 0)) > 0;

    return {
      page,
      index,
      url: page.url(),
      title: await page.title().catch(() => ''),
      rowCount,
      hasComposer,
      activationPrompt: rowCount === 0 && !hasComposer && bodyText.includes('Tab') && bodyText.includes('Zalo'),
    } satisfies ZaloPageCandidate<Page>;
  }

  private async markWatcherManagedPage(page: Page) {
    await page
      .evaluate((storageKey) => {
        window.sessionStorage.setItem(storageKey, '1');
      }, WATCHER_MANAGED_PAGE_SESSION_KEY)
      .catch(() => {});
  }

  private async isWatcherManagedPage(page: Page) {
    return page
      .evaluate((storageKey) => window.sessionStorage.getItem(storageKey) === '1', WATCHER_MANAGED_PAGE_SESSION_KEY)
      .catch(() => false);
  }

  private async loadPersistedState() {
    try {
      const raw = await readFile(env.WATCHER_PLAYWRIGHT_STATE_FILE, 'utf8');
      const parsed = JSON.parse(raw) as PersistedWatcherState;

      if (!parsed.knownSignatures || typeof parsed.knownSignatures !== 'object') {
        return;
      }

      this.knownSignatures = new Map(Object.entries(parsed.knownSignatures));
      this.knownGroupNames = new Map(
        Object.entries(parsed.knownGroupNames ?? {}).filter((entry): entry is [string, string] => {
          const [groupExternalId, name] = entry;
          return Boolean(groupExternalId && typeof name === 'string' && name.trim());
        }),
      );
      this.loadedPersistedState = true;
      logger.info('watcher_state_loaded', {
        stateFile: env.WATCHER_PLAYWRIGHT_STATE_FILE,
        entries: this.knownSignatures.size,
        knownGroupNames: this.knownGroupNames.size,
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

  private async persistState() {
    const state: PersistedWatcherState = {
      knownSignatures: Object.fromEntries(this.knownSignatures.entries()),
      knownGroupNames: Object.fromEntries(this.knownGroupNames.entries()),
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

  private async listConversationCategories(page: Page) {
    const categories = await this.readConversationCategories(page);
    return sortConversationCategoriesForScan(categories.map((category) => category.key));
  }

  private async readConversationCategories(page: Page) {
    return page
      .evaluate((labelsByKey) => {
        const normalize = (value: string | null) =>
          (value ?? '')
            .normalize('NFD')
            .replace(/\p{Diacritic}/gu, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
        const labelToKey = new Map<string, ConversationCategoryKey>();

        for (const [key, labels] of Object.entries(labelsByKey) as Array<[ConversationCategoryKey, string[]]>) {
          for (const label of labels) {
            labelToKey.set(normalize(label), key);
          }
        }

        const isVisible = (element: Element | null) => {
          if (!(element instanceof HTMLElement)) {
            return false;
          }

          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
        };
        const getClickable = (element: HTMLElement) =>
          (element.closest('.tab-item, [role="tab"], button, a') as HTMLElement | null) ?? element;
        const candidates = Array.from(
          document.querySelectorAll<HTMLElement>('.tab-item, [role="tab"], button, a, span, div'),
        );
        const seen = new Set<ConversationCategoryKey>();
        const categories: ConversationCategoryDomItem[] = [];

        for (const candidate of candidates) {
          const label = (candidate.innerText || candidate.textContent || '').trim();
          if (!label || label.length > 40) {
            continue;
          }

          const key = labelToKey.get(normalize(label));
          if (!key || seen.has(key)) {
            continue;
          }

          const clickable = getClickable(candidate);
          if (!isVisible(candidate) || !isVisible(clickable)) {
            continue;
          }

          const className = String(clickable.getAttribute('class') ?? '');
          const ariaSelected = clickable.getAttribute('aria-selected');
          categories.push({
            key,
            label,
            active: ariaSelected === 'true' || /\b(active|selected)\b/i.test(className),
          });
          seen.add(key);
        }

        return categories;
      }, CONVERSATION_CATEGORY_LABELS)
      .catch(() => [] as ConversationCategoryDomItem[]);
  }

  private async switchConversationCategory(page: Page, categoryKey: ConversationCategoryKey) {
    const switched = await page
      .evaluate(
        ({ labelsByKey, categoryKey }) => {
          const normalize = (value: string | null) =>
            (value ?? '')
              .normalize('NFD')
              .replace(/\p{Diacritic}/gu, '')
              .replace(/\s+/g, ' ')
              .trim()
              .toLowerCase();
          const targetLabels = new Set((labelsByKey[categoryKey] ?? []).map((label) => normalize(label)));
          const isVisible = (element: Element | null) => {
            if (!(element instanceof HTMLElement)) {
              return false;
            }

            const rect = element.getBoundingClientRect();
            const style = window.getComputedStyle(element);
            return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
          };
          const candidates = Array.from(
            document.querySelectorAll<HTMLElement>('.tab-item, [role="tab"], button, a, span, div'),
          );

          for (const candidate of candidates) {
            const label = (candidate.innerText || candidate.textContent || '').trim();
            if (!label || label.length > 40 || !targetLabels.has(normalize(label)) || !isVisible(candidate)) {
              continue;
            }

            const clickable = (candidate.closest('.tab-item, [role="tab"], button, a') as HTMLElement | null) ?? candidate;
            if (!isVisible(clickable)) {
              continue;
            }

            clickable.click();
            return true;
          }

          return false;
        },
        { labelsByKey: CONVERSATION_CATEGORY_LABELS, categoryKey },
      )
      .catch(() => false);

    if (!switched) {
      return false;
    }

    await page.waitForTimeout(450);
    return true;
  }

  private async readLatestConversationMessage(
    page: Page,
    conversationId: string,
  ): Promise<ConversationMessageDetails | null> {
    const row = page.locator(
      `#conversationList .msg-item[data-id="div_TabMsg_ThrdChItem"][anim-data-id="${conversationId}"]`,
    );

    if ((await row.count()) === 0) {
      return null;
    }

    try {
      await row.first().click({ force: true, timeout: 5_000 });
      await page
        .waitForFunction(
          (rowSelector) => {
            const activeRow = document.querySelector(rowSelector);
            return Boolean(activeRow && /\b(active|selected)\b/i.test(activeRow.className));
          },
          `#conversationList .msg-item[data-id="div_TabMsg_ThrdChItem"][anim-data-id="${conversationId}"]`,
          { timeout: 1_500 },
        )
        .catch(() => {});
    } catch {
      return null;
    }

    const bubbles = page.locator('.chat-message[data-component="bubble-message"]');

    let bubbleCount = 0;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      bubbleCount = await bubbles.count().catch(() => 0);

      if (bubbleCount > 0) {
        break;
      }

      await page.waitForTimeout(350 * (attempt + 1));
    }

    for (let index = bubbleCount - 1; index >= 0; index -= 1) {
      const bubble = bubbles.nth(index);

      const candidateSelectors = [
        '[data-component="message-text-content"]',
        '.text-message__container',
        '.img-msg-v2__cap',
        '.text',
        '.msg-text',
        '.message-action',
      ];
      const candidateTexts = await Promise.all(
        candidateSelectors.map((selector) => bubble.locator(selector).first().innerText().catch(() => null)),
      );
      const messageText = candidateTexts.map((value) => normalizePreservedMessageText(value)).find(Boolean) ?? null;
      if (!messageText) {
        continue;
      }

      const senderName = normalizeSingleLineText(
        await bubble.locator('.message-sender-name-content .truncate').first().textContent().catch(() => null),
      );

      return {
        messageText,
        senderName: senderName || undefined,
      };
    }

    return null;
  }
  private async readStoredGroupCandidates(page: Page) {
    const localStorageEntries = (await page.evaluate(() => {
      const entries: Array<[string, string]> = [];

      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (!key) {
          continue;
        }

        if (!/^0_g[^_]+_lastReceiveTs$/.test(key) && !key.endsWith('__archived_chat')) {
          continue;
        }

        const value = localStorage.getItem(key);
        if (value !== null) {
          entries.push([key, value]);
        }
      }

      return entries;
    })) as Array<[string, string]>;

    return parseStoredGroupCandidates(localStorageEntries);
  }

  private async collectSnapshotsFromCurrentCategory(page: Page, limit: number) {
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

  private async collectSnapshots(page: Page, limitPerCategory: number) {
    const categoryKeys = await this.listConversationCategories(page);

    if (categoryKeys.length === 0) {
      return this.collectSnapshotsFromCurrentCategory(page, limitPerCategory);
    }

    const snapshots = new Map<string, ConversationSnapshot>();
    const scanSummary: Array<{ categoryKey: ConversationCategoryKey; snapshots: number }> = [];

    for (const categoryKey of categoryKeys) {
      const switched = await this.switchConversationCategory(page, categoryKey);
      if (!switched) {
        scanSummary.push({ categoryKey, snapshots: 0 });
        continue;
      }

      const currentSnapshots = await this.collectSnapshotsFromCurrentCategory(page, limitPerCategory);
      scanSummary.push({ categoryKey, snapshots: currentSnapshots.length });

      for (const snapshot of currentSnapshots) {
        if (!snapshot.animDataId || snapshots.has(snapshot.animDataId)) {
          continue;
        }

        snapshots.set(snapshot.animDataId, {
          ...snapshot,
          categoryKey,
        });
      }
    }

    logger.info('watcher_conversation_category_scan_completed', {
      categories: categoryKeys,
      scanSummary,
      totalSnapshots: snapshots.size,
    });

    return Array.from(snapshots.values());
  }

  private rememberSnapshotNames(snapshots: ConversationSnapshot[]) {
    let changed = false;

    for (const snapshot of snapshots) {
      if (!snapshot.animDataId || !snapshot.name?.trim()) {
        continue;
      }

      const normalizedName = snapshot.name.trim();
      if (this.knownGroupNames.get(snapshot.animDataId) === normalizedName) {
        continue;
      }

      this.knownGroupNames.set(snapshot.animDataId, normalizedName);
      changed = true;
    }

    return changed;
  }

  private shouldEmitInitialSnapshot(snapshot: ConversationSnapshot) {
    if (snapshot.unread) {
      return true;
    }

    return isRecentTimeLabel(snapshot.timeLabel);
  }

  private shouldSkipRecentContent(signature: string) {
    const now = Date.now();
    const lastSeenAt = this.recentContentSignatures.get(signature);

    for (const [key, seenAt] of this.recentContentSignatures) {
      if (now - seenAt > WATCHER_CONTENT_DEDUPE_WINDOW_MS * 2) {
        this.recentContentSignatures.delete(key);
      }
    }

    if (lastSeenAt && now - lastSeenAt < WATCHER_CONTENT_DEDUPE_WINDOW_MS) {
      return true;
    }

    this.recentContentSignatures.set(signature, now);
    return false;
  }

  private async poll(onEvent: (event: SourceMessageEvent) => Promise<void>, isInitial: boolean) {
    const page = await this.ensurePage();
    const [snapshots, storedGroups] = await Promise.all([
      this.collectSnapshots(page, env.WATCHER_PLAYWRIGHT_VISIBLE_ITEM_LIMIT),
      this.readStoredGroupCandidates(page),
    ]);
    const storedGroupMap = new Map(storedGroups.map((group) => [group.externalId, group]));
    let stateChanged = this.rememberSnapshotNames(snapshots);
    let activeCategoryKey: ConversationCategoryKey | null = null;

    for (const snapshot of snapshots) {
      if (!snapshot.animDataId || !snapshot.preview || !snapshot.name) {
        continue;
      }

      if (env.WATCHER_PLAYWRIGHT_GROUPS_ONLY && !snapshot.animDataId.startsWith('g')) {
        continue;
      }

      const lastReceiveTs = storedGroupMap.get(snapshot.animDataId)?.lastReceiveTs ?? null;
      const signature = buildConversationSignature({
        conversationId: snapshot.animDataId,
        preview: snapshot.preview,
        lastReceiveTs,
      });
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

      if (snapshot.categoryKey && snapshot.categoryKey !== activeCategoryKey) {
        const switched = await this.switchConversationCategory(page, snapshot.categoryKey);
        if (switched) {
          activeCategoryKey = snapshot.categoryKey;
        }
      }

      const parsedPreview = parsePreview(snapshot.preview);
      const fullMessage = await this.readLatestConversationMessage(page, snapshot.animDataId);
      const resolvedMessageText = normalizePreservedMessageText(fullMessage?.messageText ?? null) ?? parsedPreview.messageText;
      const resolvedSenderName = fullMessage?.senderName ?? parsedPreview.senderName;
      const contentSignature = buildMessageContentSignature({
        senderName: resolvedSenderName,
        messageText: resolvedMessageText,
      });

      if (this.shouldSkipRecentContent(contentSignature)) {
        continue;
      }

      await onEvent({
        source: 'zalo',
        groupExternalId: snapshot.animDataId,
        groupName: snapshot.name,
        messageExternalId: `${snapshot.animDataId}:${signature}`,
        senderName: resolvedSenderName,
        messageText: resolvedMessageText,
        messageTime: resolveMessageTime(snapshot.timeLabel),
        rawPayload: {
          adapter: 'playwright_conversation_list',
          conversationId: snapshot.animDataId,
          conversationName: snapshot.name,
          preview: snapshot.preview,
          fullMessageText: fullMessage?.messageText ?? null,
          fullMessageSource: fullMessage ? 'bubble' : 'preview',
          timeLabel: snapshot.timeLabel,
          unread: snapshot.unread,
          conversationCategory: snapshot.categoryKey ?? null,
          lastReceiveTs,
        },
      });
    }

    if (stateChanged) {
      await this.persistState();
    }
  }
}

export function createSourceAdapter(mode: 'mock' | 'adapter') {
  return mode === 'mock' ? new MockAdapter() : new PlaywrightConversationListAdapter();
}









