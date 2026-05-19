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

export type SourceRule = {
  id: string;
  type: 'INCLUDE' | 'EXCLUDE';
  pattern: string;
  matchType: 'CONTAINS' | 'WHOLE_WORD';
  caseSensitive: boolean;
};

export type SourceAdapter = {
  start(onEvent: (event: SourceMessageEvent) => Promise<void>): Promise<void>;
  stop(): Promise<void>;
  listGroups(): Promise<DiscoveredSourceGroup[]>;
  seedKnownGroups?(groups: DiscoveredSourceGroup[]): Promise<void>;
  seedRules?(rules: SourceRule[]): Promise<void>;
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

  async seedKnownGroups() {}
}

type ConversationSnapshot = {
  animDataId: string;
  name: string | null;
  preview: string | null;
  timeLabel: string | null;
  unread: boolean;
  visibleIndex: number;
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
  visibleIndex: number;
};

type ScrollMetrics = {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
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
const WATCHER_REALTIME_MAX_MESSAGE_AGE_MS = 10 * 60_000;
const CONVERSATION_CATEGORY_SCAN_ORDER: ConversationCategoryKey[] = ['other', 'priority'];
const WATCHER_MAX_LIVE_SNAPSHOT_LIMIT = 80;
const CONVERSATION_ROW_SELECTOR =
  '#conversationList .msg-item[data-id="div_TabMsg_ThrdChItem"], ' +
  '#conversationList .msg-item[anim-data-id], ' +
  '#conversationList .msg-item, ' +
  '#searchResultList .msg-item[data-id="div_TabMsg_ThrdChItem"], ' +
  '#searchResultList .msg-item[anim-data-id], ' +
  '#searchResultList .msg-item, ' +
  '.conv-list .conv-item[anim-data-id], ' +
  '.conv-list .conv-item';

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

function buildMessageContentSignature(input: { conversationId: string; senderName?: string; messageText: string }) {
  const conversationIdentity = normalizeSearchLabel(input.conversationId);
  const senderIdentity = normalizeSearchLabel(input.senderName ?? 'unknown_sender');
  const messageIdentity = normalizeMessageFingerprintText(input.messageText);
  return sha256(`${conversationIdentity}|${senderIdentity}|${messageIdentity}`);
}

function escapeRulePattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeRuleText(value: string, caseSensitive: boolean) {
  const normalized = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
  return caseSensitive ? normalized : normalized.toLowerCase();
}

function doesTextMatchRule(messageText: string, rule: SourceRule) {
  const subject = normalizeRuleText(messageText, rule.caseSensitive);
  const pattern = normalizeRuleText(rule.pattern, rule.caseSensitive);

  if (!pattern) {
    return false;
  }

  if (rule.matchType === 'CONTAINS') {
    return subject.includes(pattern);
  }

  const expression = new RegExp(`(^|[^\\p{L}\\p{N}_])${escapeRulePattern(pattern)}([^\\p{L}\\p{N}_]|$)`, 'u');
  return expression.test(subject);
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

function stripLeadingSenderNameFromMessage(messageText: string, senderName?: string | null) {
  const normalizedSender = normalizeSingleLineText(senderName ?? null);
  if (!normalizedSender) {
    return messageText;
  }

  const lines = messageText.split('\n');
  const firstLine = normalizeSingleLineText(lines[0] ?? null);

  if (firstLine?.toLowerCase() !== normalizedSender.toLowerCase()) {
    return messageText;
  }

  return normalizePreservedMessageText(lines.slice(1).join('\n')) ?? messageText;
}

function scoreMessageTextCandidate(value: string | null) {
  const normalized = normalizePreservedMessageText(value);
  if (!normalized) {
    return Number.NEGATIVE_INFINITY;
  }

  let score = normalized.length;
  const compact = normalized.replace(/\s+/g, '');
  const lines = normalized.split('\n').map((line) => line.trim()).filter(Boolean);
  const reactionLikeLines = lines.filter((line) => {
    const denseLine = line.replace(/\s+/g, '');
    return denseLine.length <= 24 && /^[/:;()\-<>=+._a-z0-9]+$/i.test(denseLine) && /[:/()\-]/.test(denseLine);
  });

  if (normalized.includes('\n')) {
    score += 24;
  }

  if (normalized.endsWith('...') || normalized.endsWith('…')) {
    score -= 18;
  }

  if (compact.length <= 3) {
    score -= 40;
  }

  if (reactionLikeLines.length > 0 && reactionLikeLines.length === lines.length) {
    score -= 120;
  }

  return score;
}

export function pickBestMessageTextCandidate(values: Array<string | null | undefined>) {
  const candidates = values
    .map((value) => normalizePreservedMessageText(value ?? null))
    .filter((value): value is string => Boolean(value));

  if (candidates.length === 0) {
    return null;
  }

  return candidates.sort((left, right) => scoreMessageTextCandidate(right) - scoreMessageTextCandidate(left))[0] ?? null;
}

function toConversationSnapshot(raw: RawConversationSnapshot): ConversationSnapshot {
  return {
    animDataId: raw.animDataId,
    name: normalizeSingleLineText(raw.nameRaw),
    preview: normalizeMultilineText(raw.previewRaw),
    timeLabel: normalizeSingleLineText(raw.timeLabelRaw),
    unread: raw.unread,
    visibleIndex: raw.visibleIndex,
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

function resolveMessageTime(timeLabel: string | null, now = new Date()) {
  if (!timeLabel) {
    return now.toISOString();
  }

  const normalized = timeLabel.toLowerCase().trim();

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

function resolveSnapshotActivityTimeMs(
  input: {
    timeLabel: string | null;
    lastReceiveTs: number | null;
  },
  now = Date.now(),
) {
  if (typeof input.lastReceiveTs === 'number' && Number.isFinite(input.lastReceiveTs) && input.lastReceiveTs > 0) {
    return input.lastReceiveTs;
  }

  const resolved = Date.parse(resolveMessageTime(input.timeLabel, new Date(now)));
  if (Number.isFinite(resolved)) {
    return resolved;
  }

  return now;
}

export function isFreshSnapshotActivityTime(
  input: {
    timeLabel: string | null;
    lastReceiveTs: number | null;
  },
  now = Date.now(),
  maxAgeMs = WATCHER_REALTIME_MAX_MESSAGE_AGE_MS,
) {
  const activityAtMs = resolveSnapshotActivityTimeMs(input, now);
  const ageMs = now - activityAtMs;

  return ageMs >= -60_000 && ageMs <= maxAgeMs;
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
  return rows.map(function (item, index) {
    var row = item;
    var previewRoot =
      row.querySelector('.z-conv-message__preview-message') ||
      row.querySelector('.z-conv-message') ||
      row.querySelector('.conv-message') ||
      row.querySelector('.conv-item-body__main') ||
      row.querySelector('.conv-item-body');
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
      visibleIndex: index,
    };
  });
`,
) as (rows: Element[]) => RawConversationSnapshot[];

const readScrollTopFn = new Function(
  'node',
  `
  var target = node;
  var current = node;

  for (var depth = 0; depth < 4 && current; depth += 1) {
    var parent = current.parentElement;
    if (!parent) {
      break;
    }

    var style = window.getComputedStyle(parent);
    var canScroll =
      parent.scrollHeight > parent.clientHeight + 8 &&
      (style.overflowY === 'auto' || style.overflowY === 'scroll' || style.overflowY === 'overlay');

    if (canScroll) {
      target = parent;
      break;
    }

    current = parent;
  }

  return target.scrollTop;
`,
) as (node: Element) => number;
const readScrollMetricsFn = new Function(
  'node',
  `
  var target = node;
  var current = node;

  for (var depth = 0; depth < 4 && current; depth += 1) {
    var parent = current.parentElement;
    if (!parent) {
      break;
    }

    var style = window.getComputedStyle(parent);
    var canScroll =
      parent.scrollHeight > parent.clientHeight + 8 &&
      (style.overflowY === 'auto' || style.overflowY === 'scroll' || style.overflowY === 'overlay');

    if (canScroll) {
      target = parent;
      break;
    }

    current = parent;
  }

  return {
    scrollTop: target.scrollTop,
    clientHeight: target.clientHeight,
    scrollHeight: target.scrollHeight,
  };
`,
) as (node: Element) => ScrollMetrics;
const scrollConversationListToTopFn = new Function(
  'node',
  `
  var target = node;
  var current = node;

  for (var depth = 0; depth < 4 && current; depth += 1) {
    var parent = current.parentElement;
    if (!parent) {
      break;
    }

    var style = window.getComputedStyle(parent);
    var canScroll =
      parent.scrollHeight > parent.clientHeight + 8 &&
      (style.overflowY === 'auto' || style.overflowY === 'scroll' || style.overflowY === 'overlay');

    if (canScroll) {
      target = parent;
      break;
    }

    current = parent;
  }

  target.scrollTop = 0;
  return {
    scrollTop: target.scrollTop,
    clientHeight: target.clientHeight,
    scrollHeight: target.scrollHeight,
  };
`,
) as (node: Element) => ScrollMetrics;
const scrollConversationListFn = new Function(
  'node',
  `
  var target = node;
  var current = node;

  for (var depth = 0; depth < 4 && current; depth += 1) {
    var parent = current.parentElement;
    if (!parent) {
      break;
    }

    var style = window.getComputedStyle(parent);
    var canScroll =
      parent.scrollHeight > parent.clientHeight + 8 &&
      (style.overflowY === 'auto' || style.overflowY === 'scroll' || style.overflowY === 'overlay');

    if (canScroll) {
      target = parent;
      break;
    }

    current = parent;
  }

  var nextScrollTop = Math.min(
    target.scrollTop + Math.max(target.clientHeight * 0.85, 240),
    target.scrollHeight
  );

  target.scrollTop = nextScrollTop;

  return {
    scrollTop: target.scrollTop,
    clientHeight: target.clientHeight,
    scrollHeight: target.scrollHeight,
  };
`,
) as (node: Element) => ScrollMetrics;
const restoreScrollTopFn = new Function(
  'node',
  'scrollTop',
  `
  var target = node;
  var current = node;

  for (var depth = 0; depth < 4 && current; depth += 1) {
    var parent = current.parentElement;
    if (!parent) {
      break;
    }

    var style = window.getComputedStyle(parent);
    var canScroll =
      parent.scrollHeight > parent.clientHeight + 8 &&
      (style.overflowY === 'auto' || style.overflowY === 'scroll' || style.overflowY === 'overlay');

    if (canScroll) {
      target = parent;
      break;
    }

    current = parent;
  }

  target.scrollTop = scrollTop;
`,
) as (node: Element, scrollTop: number) => void;

export class PlaywrightConversationListAdapter implements SourceAdapter {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private browserTaskQueue: Promise<void> = Promise.resolve();
  private stopped = false;
  private knownSignatures = new Map<string, string>();
  private knownGroupNames = new Map<string, string>();
  private rules: SourceRule[] = [];
  private recentContentSignatures = new Map<string, number>();
  private loadedPersistedState = false;
  private consecutiveEmptySnapshotPolls = 0;

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

  async seedKnownGroups(groups: DiscoveredSourceGroup[]) {
    let changed = false;

    for (const group of groups) {
      const normalizedName = group.name?.trim();
      if (!group.externalId || !normalizedName) {
        continue;
      }

      if (this.knownGroupNames.get(group.externalId) === normalizedName) {
        continue;
      }

      this.knownGroupNames.set(group.externalId, normalizedName);
      changed = true;
    }

    if (changed) {
      await this.persistState();
    }
  }

  async seedRules(rules: SourceRule[]) {
    this.rules = rules;
  }

  async listGroups() {
    return this.runSerialized(async () =>
      this.withRecoveredBrowser('list_groups', async () => {
        const page = await this.ensurePage();
        await this.clearConversationSearch(page);
        await this.ensureRecentMessagesSynced(page);
        const [snapshots, storedGroups] = await Promise.all([
          this.collectTopSnapshots(page, env.WATCHER_PLAYWRIGHT_GROUP_DISCOVERY_LIMIT),
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
          recoveredSnapshots: 0,
          storedGroups: storedGroups.length,
          totalGroups: groups.length,
          mode: 'top_sidebar_plus_storage',
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
      const preferredManagedPage = choosePreferredZaloPage(managedCandidates);
      const preferredExistingPage = choosePreferredZaloPage(pageCandidates);

      if (preferredManagedPage) {
        this.page = preferredManagedPage.page;
        logger.info('watcher_playwright_page_selected', {
          selectedIndex: preferredManagedPage.index,
          selectedRowCount: preferredManagedPage.rowCount,
          selectedHasComposer: preferredManagedPage.hasComposer,
          selectedActivationPrompt: preferredManagedPage.activationPrompt,
          totalZaloPages: pageCandidates.length,
          selectionSource: 'managed_page',
        });
      } else if (preferredExistingPage) {
        this.page = preferredExistingPage.page;
        logger.info('watcher_playwright_page_selected', {
          selectedIndex: preferredExistingPage.index,
          selectedRowCount: preferredExistingPage.rowCount,
          selectedHasComposer: preferredExistingPage.hasComposer,
          selectedActivationPrompt: preferredExistingPage.activationPrompt,
          totalZaloPages: pageCandidates.length,
          selectionSource: 'existing_page_fallback',
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

    await this.clearConversationSearch(this.page);
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
    const normalizedBodyText = normalizeSearchLabel(bodyText);

    const rowCount = await page
      .locator(CONVERSATION_ROW_SELECTOR)
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
      activationPrompt:
        (rowCount === 0 && !hasComposer && bodyText.includes('Tab') && bodyText.includes('Zalo')) ||
        normalizedBodyText.includes('ban dang mo zalo tren mot tab khac') ||
        normalizedBodyText.includes('nhan kich hoat de su dung tren tab nay') ||
        normalizedBodyText.includes('dang dang nhap'),
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

  private async ensureRecentMessagesSynced(page: Page) {
    const directSyncButton = page
      .getByText(/nhấn để đồng bộ ngay/i)
      .or(page.getByText(/đồng bộ ngay/i))
      .first();

    if ((await directSyncButton.count().catch(() => 0)) > 0) {
      const clicked = await directSyncButton
        .click({ timeout: 2_500 })
        .then(() => true)
        .catch(() => false);

      if (clicked) {
        logger.info('watcher_playwright_recent_sync_requested', {
          source: 'playwright_locator',
        });
        await page.waitForTimeout(1_200);
      }
    }

    const syncInfo = await page
      .evaluate(() => {
        const normalize = (value: string | null) =>
          (value ?? '')
            .normalize('NFD')
            .replace(/\p{Diacritic}/gu, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();

        const bodyText = normalize(document.body.innerText);
        const hasSyncBanner =
          bodyText.includes('dong bo tin nhan gan day') && bodyText.includes('dong bo ngay');

        if (!hasSyncBanner) {
          return {
            triggered: false,
            hasSyncBanner: false,
          };
        }

        const candidates = Array.from(document.querySelectorAll('button, a, [role="button"], span, div'));
        for (const candidate of candidates) {
          const label = normalize(candidate.textContent);
          if (!label.includes('dong bo ngay')) {
            continue;
          }

          (candidate as HTMLElement).click();
          return {
            triggered: true,
            hasSyncBanner: true,
          };
        }

        return {
          triggered: false,
          hasSyncBanner: true,
        };
      })
      .catch(() => ({
        triggered: false,
        hasSyncBanner: false,
      }));

    if (!syncInfo.hasSyncBanner) {
      return false;
    }

    if (syncInfo.triggered) {
      logger.info('watcher_playwright_recent_sync_requested');
    } else {
      logger.warn('watcher_playwright_recent_sync_banner_detected_without_click_target');
    }

    await page.waitForTimeout(syncInfo.triggered ? 1_200 : 400);
    await page
      .waitForFunction(() => {
        const normalize = (value: string | null) =>
          (value ?? '')
            .normalize('NFD')
            .replace(/\p{Diacritic}/gu, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();

        const bodyText = normalize(document.body.innerText);
        const rowSelectors = [
          '#conversationList .msg-item[data-id="div_TabMsg_ThrdChItem"]',
          '#conversationList .msg-item[anim-data-id]',
          '#conversationList .msg-item',
          '.conv-list .conv-item[anim-data-id]',
          '.conv-list .conv-item',
        ];
        const rowCount = rowSelectors.reduce(
          (maxCount, selector) => Math.max(maxCount, document.querySelectorAll(selector).length),
          0,
        );

        return !bodyText.includes('dong bo tin nhan gan day') || rowCount > 12;
      }, undefined, { timeout: 12_000 })
      .catch(() => {});

    return syncInfo.triggered;
  }

  private async clearConversationSearch(page: Page) {
    const searchInput = page
      .locator('#contact-search-input, input[data-id="txt_Main_Search"], input[type="search"]')
      .first();
    if ((await searchInput.count()) === 0) {
      return false;
    }

    const forceClearSearchUi = async () =>
      page
        .evaluate(() => {
          const normalize = (value: string | null) =>
            (value ?? '')
              .normalize('NFD')
              .replace(/\p{Diacritic}/gu, '')
              .replace(/\s+/g, ' ')
              .trim()
              .toLowerCase();

          const input = document.querySelector<HTMLInputElement>(
            '#contact-search-input, input[data-id="txt_Main_Search"], input[type="search"]',
          );
          if (input) {
            input.focus();
            input.value = '';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
            input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Escape' }));
            input.blur();
          }

          const clearSelectors = [
            '#contact-search .fa-textbox-icon-clear',
            '#contact-search .close-spinner',
            '#contact-search [data-translate-inner="STR_CLOSE"]',
            '#contact-search .z--btn--v2',
            '#contact-search .btn-tertiary-neutral',
          ];
          for (const selector of clearSelectors) {
            const element = document.querySelector<HTMLElement>(selector);
            element?.click();
          }

          for (const candidate of Array.from(document.querySelectorAll<HTMLElement>('button, a, [role="button"], span, div'))) {
            const label = normalize(candidate.textContent);
            if (label === 'dong' || label === 'xoa') {
              candidate.click();
            }
          }
        })
        .catch(() => {});

    const readSearchState = async () =>
      page
        .evaluate(() => {
          const normalize = (value: string | null) =>
            (value ?? '')
              .normalize('NFD')
              .replace(/\p{Diacritic}/gu, '')
              .replace(/\s+/g, ' ')
              .trim()
              .toLowerCase();

          const input = document.querySelector<HTMLInputElement>(
            '#contact-search-input, input[data-id="txt_Main_Search"], input[type="search"]',
          );
          const bodyText = normalize(document.body.innerText);
          const rowSelectors = [
            '#conversationList .msg-item[data-id="div_TabMsg_ThrdChItem"]',
            '#conversationList .msg-item',
            '#conversationList [anim-data-id]',
            '.conv-list .conv-item',
            '.conv-item[anim-data-id]',
          ];
          const rowCount = rowSelectors.reduce(
            (maxCount, selector) => Math.max(maxCount, document.querySelectorAll(selector).length),
            0,
          );

          return {
            value: input?.value?.trim() ?? '',
            rowCount,
            hasSearchResultList: Boolean(document.querySelector('#searchResultList')),
            hasSearchOverlay:
              bodyText.includes('tat ca') &&
              bodyText.includes('lien he') &&
              bodyText.includes('tin nhan') &&
              bodyText.includes('file') &&
              bodyText.includes('dong'),
          };
        })
        .catch(() => ({
          value: '',
          rowCount: 0,
          hasSearchResultList: false,
          hasSearchOverlay: false,
        }));

    const initialState = await readSearchState();

    if (!initialState.value && !initialState.hasSearchOverlay && !initialState.hasSearchResultList) {
      return false;
    }

    let finalState = initialState;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await searchInput.click({ timeout: 2_000 }).catch(() => {});
      await page.keyboard.press(`${process.platform === 'win32' ? 'Control' : 'Meta'}+A`).catch(() => {});
      await page.keyboard.press('Backspace').catch(() => {});
      await page
        .locator('#contact-search .fa-textbox-icon-clear, #contact-search .close-spinner')
        .first()
        .click({ force: true, timeout: 1_500 })
        .catch(() => {});
      await searchInput.fill('').catch(() => {});
      await page.keyboard.press('Escape').catch(() => {});
      await forceClearSearchUi();
      await page
        .locator('#contact-search [data-translate-inner="STR_CLOSE"]')
        .first()
        .click({ force: true, timeout: 1_500 })
        .catch(() => {});
      await page
        .locator('#contact-search .z--btn--v2, #contact-search .btn-tertiary-neutral')
        .first()
        .click({ force: true, timeout: 1_500 })
        .catch(() => {});
      await page.waitForTimeout(350 * (attempt + 1));

      finalState = await readSearchState();
      if (!finalState.value && !finalState.hasSearchOverlay && !finalState.hasSearchResultList && finalState.rowCount > 0) {
        logger.info('watcher_playwright_search_cleared', {
          previousValue: initialState.value,
          hadSearchOverlay: initialState.hasSearchOverlay,
          attempts: attempt + 1,
          finalRowCount: finalState.rowCount,
        });
        return true;
      }
    }

    if (finalState.value || finalState.hasSearchOverlay || finalState.hasSearchResultList) {
      await page.goto(env.WATCHER_ZALO_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => {});
      await page.waitForTimeout(2_000);
      finalState = await readSearchState();

      if (!finalState.value && !finalState.hasSearchOverlay && !finalState.hasSearchResultList && finalState.rowCount > 0) {
        logger.info('watcher_playwright_search_cleared_via_reload', {
          previousValue: initialState.value,
          hadSearchOverlay: initialState.hasSearchOverlay,
          finalRowCount: finalState.rowCount,
        });
        return true;
      }
    }

    logger.warn('watcher_playwright_search_clear_incomplete', {
      previousValue: initialState.value,
      hadSearchOverlay: initialState.hasSearchOverlay,
      finalRowCount: finalState.rowCount,
      finalHasSearchOverlay: finalState.hasSearchOverlay,
      finalHasSearchResultList: finalState.hasSearchResultList,
      finalValue: finalState.value,
    });
    return true;
  }

  private async searchConversationSnapshot(page: Page, groupName: string) {
    const normalizedTarget = normalizeSearchLabel(groupName);
    if (!normalizedTarget) {
      return null;
    }

    const searchInput = page
      .locator('#contact-search-input, input[data-id="txt_Main_Search"], input[type="search"]')
      .first();
    if ((await searchInput.count()) === 0) {
      return null;
    }

    await searchInput.click({ timeout: 2_000 }).catch(() => {});
    await searchInput.fill(groupName);
    await page
      .waitForFunction(
        () =>
          document.querySelectorAll('#searchResultList .msg-item[anim-data-id], #searchResultList .conv-item[anim-data-id], #conversationList .msg-item[anim-data-id], .conv-list .conv-item[anim-data-id]').length > 0,
        undefined,
        { timeout: 1_500 },
      )
      .catch(() => {});
    await page.waitForTimeout(250);

    const visibleSnapshots = await this.readVisibleSnapshots(page);
    const exactSnapshot =
      visibleSnapshots.find((snapshot) => normalizeSearchLabel(snapshot.name) === normalizedTarget) ?? null;

    if (exactSnapshot) {
      return exactSnapshot;
    }

    return (
      visibleSnapshots.find((snapshot) => {
        const normalizedName = normalizeSearchLabel(snapshot.name);
        return Boolean(
          normalizedName &&
            (normalizedName.includes(normalizedTarget) || normalizedTarget.includes(normalizedName)),
        );
      }) ?? null
    );
  }

  private async collectSearchFallbackSnapshots(
    page: Page,
    storedGroups: StoredGroupCandidate[],
    existingSnapshots: ConversationSnapshot[],
    limit: number,
  ) {
    if (limit <= 0) {
      return [] as ConversationSnapshot[];
    }

    const existingIds = new Set(existingSnapshots.map((snapshot) => snapshot.animDataId).filter(Boolean));
    const candidates = storedGroups
      .filter((group) => !existingIds.has(group.externalId))
      .map((group) => ({
        externalId: group.externalId,
        lastReceiveTs: group.lastReceiveTs ?? 0,
        name: this.knownGroupNames.get(group.externalId)?.trim() ?? '',
      }))
      .filter((group) => group.name)
      .sort((left, right) => right.lastReceiveTs - left.lastReceiveTs)
      .slice(0, limit);

    if (candidates.length === 0) {
      return [];
    }

    const recoveredSnapshots: ConversationSnapshot[] = [];

    try {
      for (const candidate of candidates) {
        const recoveredSnapshot = await this.searchConversationSnapshot(page, candidate.name);
        if (!recoveredSnapshot?.animDataId || existingIds.has(recoveredSnapshot.animDataId)) {
          continue;
        }

        recoveredSnapshots.push(recoveredSnapshot);
        existingIds.add(recoveredSnapshot.animDataId);
      }
    } finally {
      await this.clearConversationSearch(page);
    }

    if (recoveredSnapshots.length > 0) {
      logger.info('watcher_playwright_search_fallback_completed', {
        recoveredSnapshots: recoveredSnapshots.length,
        attemptedCandidates: candidates.length,
      });
    }

    return recoveredSnapshots;
  }

  private async loadPersistedState() {
    try {
      const raw = await readFile(env.WATCHER_PLAYWRIGHT_STATE_FILE, 'utf8');
      const parsed = JSON.parse(raw) as PersistedWatcherState;

      if (!parsed.knownSignatures || typeof parsed.knownSignatures !== 'object') {
        return;
      }

      this.knownSignatures = new Map([
        ...Object.entries(parsed.knownSignatures),
        ...this.knownSignatures.entries(),
      ]);

      for (const [groupExternalId, name] of Object.entries(parsed.knownGroupNames ?? {})) {
        if (!groupExternalId || typeof name !== 'string' || !name.trim() || this.knownGroupNames.has(groupExternalId)) {
          continue;
        }

        this.knownGroupNames.set(groupExternalId, name.trim());
      }
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
      CONVERSATION_ROW_SELECTOR,
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
          document.querySelectorAll<HTMLElement>(
            '.msg-filters-bar .tab-item, .tab-main .tab-item, .msg-filters-bar [role="tab"], .tab-main [role="tab"]',
          ),
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
            document.querySelectorAll<HTMLElement>(
              '.msg-filters-bar .tab-item, .tab-main .tab-item, .msg-filters-bar [role="tab"], .tab-main [role="tab"]',
            ),
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

  private async ensureConversationRowVisible(page: Page, conversationId: string) {
    const rowSelector =
      `#conversationList .msg-item[data-id="div_TabMsg_ThrdChItem"][anim-data-id="${conversationId}"], ` +
      `#conversationList .msg-item[anim-data-id="${conversationId}"], ` +
      `#searchResultList .msg-item[data-id="div_TabMsg_ThrdChItem"][anim-data-id="${conversationId}"], ` +
      `#searchResultList .msg-item[anim-data-id="${conversationId}"], ` +
      `.conv-list .conv-item[anim-data-id="${conversationId}"]`;
    const row = page.locator(rowSelector);

    if ((await row.count()) > 0) {
      return true;
    }

    const conversationList = page.locator('#conversationList');
    if ((await conversationList.count()) === 0) {
      return false;
    }

    const originalScrollTop = await conversationList.evaluate(readScrollTopFn).catch(() => 0);
    let found = false;

    try {
      await conversationList.evaluate(scrollConversationListToTopFn).catch(() => ({ scrollTop: 0, clientHeight: 0, scrollHeight: 0 }));
      await page.waitForTimeout(150);

      for (let pass = 0; pass < 20; pass += 1) {
        if ((await row.count()) > 0) {
          found = true;
          logger.info('watcher_playwright_message_row_recovered_via_scroll', {
            conversationId,
            pass: pass + 1,
          });
          break;
        }

        const currentMetrics = await conversationList.evaluate(readScrollMetricsFn).catch(() => ({ scrollTop: 0, clientHeight: 0, scrollHeight: 0 }));
        const reachedBottom = currentMetrics.scrollTop + currentMetrics.clientHeight >= currentMetrics.scrollHeight - 16;
        const nextMetrics = await conversationList.evaluate(scrollConversationListFn).catch(() => currentMetrics);

        await page.waitForTimeout(140);

        if (Math.abs(nextMetrics.scrollTop - currentMetrics.scrollTop) <= 1 && reachedBottom) {
          break;
        }
      }
    } finally {
      if (!found) {
        await conversationList.evaluate(restoreScrollTopFn, originalScrollTop).catch(() => {});
      }
    }

    return found;
  }

  private async readLatestConversationMessage(
    page: Page,
    conversationId: string,
    conversationName?: string | null,
  ): Promise<ConversationMessageDetails | null> {
    const row = page.locator(
      `#conversationList .msg-item[data-id="div_TabMsg_ThrdChItem"][anim-data-id="${conversationId}"], ` +
        `#conversationList .msg-item[anim-data-id="${conversationId}"], ` +
        `#searchResultList .msg-item[data-id="div_TabMsg_ThrdChItem"][anim-data-id="${conversationId}"], ` +
        `#searchResultList .msg-item[anim-data-id="${conversationId}"], ` +
        `.conv-list .conv-item[anim-data-id="${conversationId}"]`,
    );

    if ((await row.count()) === 0) {
      await this.ensureConversationRowVisible(page, conversationId);
    }

    if ((await row.count()) === 0) {
      logger.info('watcher_playwright_message_row_not_visible', {
        conversationId,
        conversationName: conversationName ?? null,
      });
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
            `#conversationList .msg-item[data-id="div_TabMsg_ThrdChItem"][anim-data-id="${conversationId}"], ` +
              `#conversationList .msg-item[anim-data-id="${conversationId}"], ` +
              `#searchResultList .msg-item[data-id="div_TabMsg_ThrdChItem"][anim-data-id="${conversationId}"], ` +
              `#searchResultList .msg-item[anim-data-id="${conversationId}"], ` +
              `.conv-list .conv-item[anim-data-id="${conversationId}"]`,
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
        '[data-component="message-content"]',
        '.text-message__container',
        '.text-message',
        '.img-msg-v2__cap',
        '.link-message',
        '.msg-text',
        '.text',
      ];
      const candidateTexts = await Promise.all([
        ...candidateSelectors.map((selector) =>
          bubble.locator(selector).first().innerText({ timeout: 250 }).catch(() => null),
        ),
        bubble.innerText({ timeout: 500 }).catch(() => null),
      ]);
      const messageText = pickBestMessageTextCandidate(candidateTexts);
      if (!messageText) {
        continue;
      }

      const senderName = normalizeSingleLineText(
        await bubble.locator('.message-sender-name-content .truncate').first().textContent({ timeout: 250 }).catch(() => null),
      );
      return {
        messageText: stripLeadingSenderNameFromMessage(messageText, senderName),
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

  private async collectTopSnapshotsFromCurrentCategory(page: Page, limit: number) {
    const conversationList = page.locator('#conversationList');
    const hasConversationList = (await conversationList.count()) > 0;

    if (!hasConversationList) {
      return (await this.readVisibleSnapshots(page))
        .filter((snapshot) => Boolean(snapshot.animDataId))
        .slice(0, limit);
    }

    await conversationList.evaluate(scrollConversationListToTopFn).catch(() => ({ scrollTop: 0, clientHeight: 0, scrollHeight: 0 }));
    await page.waitForTimeout(120);
    return (await this.readVisibleSnapshots(page))
      .filter((snapshot) => Boolean(snapshot.animDataId))
      .slice(0, limit);
  }

  private async collectTopSnapshots(page: Page, totalLimit: number) {
    const categoryKeys = await this.listConversationCategories(page);

    if (categoryKeys.length === 0) {
      return this.collectTopSnapshotsFromCurrentCategory(page, totalLimit);
    }

    const limitPerCategory = Math.max(1, totalLimit);
    const snapshots = new Map<string, ConversationSnapshot>();
    const scanSummary: Array<{ categoryKey: ConversationCategoryKey; snapshots: number }> = [];

    for (const categoryKey of categoryKeys) {
      const switched = await this.switchConversationCategory(page, categoryKey);
      if (!switched) {
        scanSummary.push({ categoryKey, snapshots: 0 });
        continue;
      }

      const currentSnapshots = await this.collectTopSnapshotsFromCurrentCategory(page, limitPerCategory);
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

    logger.info('watcher_conversation_category_live_scan_completed', {
      categories: categoryKeys,
      limitPerCategory,
      scanSummary,
      totalSnapshots: snapshots.size,
    });

    return Array.from(snapshots.values()).slice(0, totalLimit);
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
    let stalledScrollPasses = 0;
    const maxPasses = Math.max(16, Math.ceil(limit / 4) + 10);

    try {
      await conversationList.evaluate(scrollConversationListToTopFn);
      await page.waitForTimeout(150);

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

        const currentMetrics = await conversationList.evaluate(readScrollMetricsFn);
        const reachedBottom = currentMetrics.scrollTop + currentMetrics.clientHeight >= currentMetrics.scrollHeight - 16;

        if (reachedBottom && stablePasses >= 1) {
          break;
        }

        const nextMetrics = await conversationList.evaluate(scrollConversationListFn);
        if (Math.abs(nextMetrics.scrollTop - currentMetrics.scrollTop) <= 1) {
          stalledScrollPasses += 1;
        } else {
          stalledScrollPasses = 0;
        }

        if (stablePasses >= 2 && stalledScrollPasses >= 1) {
          break;
        }

        await page.waitForTimeout(180);
      }
    } finally {
      await conversationList.evaluate(restoreScrollTopFn, originalScrollTop);
    }

    return Array.from(snapshots.values()).slice(0, limit);
  }

  private async recoverConversationList(page: Page, reason: string) {
    logger.warn('watcher_playwright_conversation_list_recovering', {
      reason,
    });

    await this.clearConversationSearch(page);
    await page
      .goto(env.WATCHER_ZALO_URL, {
        waitUntil: 'domcontentloaded',
        timeout: 15_000,
      })
      .catch(() => {});
    await page.waitForTimeout(1_200);
    await this.markWatcherManagedPage(page);
    await this.clearConversationSearch(page);
    await this.ensureRecentMessagesSynced(page);
  }

  private async collectSnapshotsInternal(page: Page, limitPerCategory: number) {
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

  private async collectSnapshots(
    page: Page,
    limitPerCategory: number,
    recoveryAttempt = 0,
  ): Promise<ConversationSnapshot[]> {
    const snapshots = await this.collectSnapshotsInternal(page, limitPerCategory);

    if (snapshots.length > 0) {
      return snapshots;
    }

    if (recoveryAttempt >= 1) {
      return snapshots;
    }

    await this.recoverConversationList(page, 'empty_snapshot_scan');
    return this.collectSnapshots(page, limitPerCategory, recoveryAttempt + 1);
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

  private scoreSnapshotForImmediateProcessing(snapshot: ConversationSnapshot, previousSignature: string | undefined) {
    let score = 0;

    if (snapshot.unread) {
      score += 1_000;
    }

    if (isRecentTimeLabel(snapshot.timeLabel)) {
      score += 500;
    }

    if (previousSignature === undefined) {
      score += 220;
    }

    if (snapshot.categoryKey === 'other') {
      score += 40;
    }

    score += Math.max(0, 200 - snapshot.visibleIndex * 15);
    return score;
  }

  private shouldPrioritizeSnapshotByRules(snapshot: ConversationSnapshot) {
    if (!env.WATCHER_PLAYWRIGHT_RULE_PREFILTER_ENABLED || this.rules.length === 0) {
      return true;
    }

    const parsedPreview = parsePreview(snapshot.preview ?? '');
    const text = parsedPreview.messageText || snapshot.preview || '';
    const includeRules = this.rules.filter((rule) => rule.type === 'INCLUDE');
    const excludeRules = this.rules.filter((rule) => rule.type === 'EXCLUDE');

    return includeRules.some((rule) => doesTextMatchRule(text, rule)) &&
      !excludeRules.some((rule) => doesTextMatchRule(text, rule));
  }

  private getLiveSnapshotLimit() {
    return Math.min(env.WATCHER_PLAYWRIGHT_VISIBLE_ITEM_LIMIT, WATCHER_MAX_LIVE_SNAPSHOT_LIMIT);
  }

  private getImmediateConversationLimit() {
    return Math.min(env.WATCHER_PLAYWRIGHT_MAX_CONVERSATIONS_PER_POLL, this.getLiveSnapshotLimit());
  }

  private async poll(onEvent: (event: SourceMessageEvent) => Promise<void>, isInitial: boolean) {
    const page = await this.ensurePage();
    if (!env.WATCHER_PLAYWRIGHT_FAST_PREVIEW_ONLY && !env.WATCHER_PLAYWRIGHT_RULE_PREFILTER_ENABLED) {
      await this.clearConversationSearch(page);
      await this.ensureRecentMessagesSynced(page);
    }
    const liveSnapshotLimit = this.getLiveSnapshotLimit();
    const immediateConversationLimit = this.getImmediateConversationLimit();

    const [initialSnapshots, storedGroups] = await Promise.all([
      this.collectTopSnapshots(page, liveSnapshotLimit),
      this.readStoredGroupCandidates(page),
    ]);
    let snapshots = initialSnapshots;

    if (snapshots.length === 0) {
      await this.recoverConversationList(page, 'empty_live_snapshot_scan');
      snapshots = await this.collectTopSnapshots(page, liveSnapshotLimit);
    }

    if (snapshots.length === 0) {
      this.consecutiveEmptySnapshotPolls += 1;
      logger.warn('watcher_playwright_empty_snapshot_poll', {
        consecutiveEmptySnapshotPolls: this.consecutiveEmptySnapshotPolls,
      });

      if (this.consecutiveEmptySnapshotPolls >= 2) {
        await this.resetBrowserState('consecutive_empty_snapshot_polls');
      }
    } else {
      this.consecutiveEmptySnapshotPolls = 0;
    }

    logger.info('watcher_playwright_live_poll_completed', {
      liveSnapshots: snapshots.length,
      storedGroups: storedGroups.length,
      liveSnapshotLimit,
      immediateConversationLimit,
    });

    const storedGroupMap = new Map(storedGroups.map((group) => [group.externalId, group]));
    let stateChanged = this.rememberSnapshotNames(snapshots);
    let activeCategoryKey: ConversationCategoryKey | null = null;
    let staleCandidates = 0;
    const changedCandidates: Array<{
      snapshot: ConversationSnapshot;
      previousSignature: string | undefined;
      signature: string;
      lastReceiveTs: number | null;
      activityAtMs: number;
      score: number;
    }> = [];

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

      const activityAtMs = resolveSnapshotActivityTimeMs({
        timeLabel: snapshot.timeLabel,
        lastReceiveTs,
      });

      if (
        snapshot.visibleIndex >= liveSnapshotLimit ||
        !isFreshSnapshotActivityTime({
          timeLabel: snapshot.timeLabel,
          lastReceiveTs,
        })
      ) {
        this.knownSignatures.set(snapshot.animDataId, signature);
        stateChanged = true;
        staleCandidates += 1;
        continue;
      }

      changedCandidates.push({
        snapshot,
        previousSignature,
        signature,
        lastReceiveTs,
        activityAtMs,
        score: this.scoreSnapshotForImmediateProcessing(snapshot, previousSignature),
      });
    }

    const sortedCandidates = changedCandidates.sort(
      (left, right) => right.score - left.score || left.snapshot.visibleIndex - right.snapshot.visibleIndex,
    );
    const rulePrioritizedCandidates = sortedCandidates.filter((candidate) =>
      this.shouldPrioritizeSnapshotByRules(candidate.snapshot),
    );
    const rulePrioritizedIds = new Set(rulePrioritizedCandidates.map((candidate) => candidate.snapshot.animDataId));
    const freshnessFallbackCandidates = sortedCandidates.filter(
      (candidate) => !candidate.snapshot.animDataId || !rulePrioritizedIds.has(candidate.snapshot.animDataId),
    );
    const freshnessReserve =
      rulePrioritizedCandidates.length > 0 && freshnessFallbackCandidates.length > 0
        ? Math.min(2, Math.max(1, immediateConversationLimit - 1))
        : 0;
    const selectedRuleCandidates = rulePrioritizedCandidates.slice(0, immediateConversationLimit - freshnessReserve);
    const immediateCandidates = [
      ...selectedRuleCandidates,
      ...freshnessFallbackCandidates.slice(0, immediateConversationLimit - selectedRuleCandidates.length),
    ];

    logger.info('watcher_playwright_immediate_candidates_selected', {
      changedCandidates: changedCandidates.length,
      rulePrioritizedCandidates: rulePrioritizedCandidates.length,
      freshnessFallbackCandidates: freshnessFallbackCandidates.length,
      freshnessReserve,
      immediateCandidates: immediateCandidates.length,
      staleCandidates,
      candidateGroups: immediateCandidates.map((candidate) => ({
        conversationId: candidate.snapshot.animDataId,
        conversationName: candidate.snapshot.name,
        visibleIndex: candidate.snapshot.visibleIndex,
        unread: candidate.snapshot.unread,
        timeLabel: candidate.snapshot.timeLabel,
        activityAt: new Date(candidate.activityAtMs).toISOString(),
        score: candidate.score,
      })),
    });

    for (const candidate of immediateCandidates) {
      const { snapshot, previousSignature, signature, lastReceiveTs, score } = candidate;
      const conversationName = snapshot.name;
      const previewText = snapshot.preview;

      if (!conversationName || !previewText) {
        continue;
      }

      if (!env.WATCHER_PLAYWRIGHT_FAST_PREVIEW_ONLY && snapshot.categoryKey && snapshot.categoryKey !== activeCategoryKey) {
        const switched = await this.switchConversationCategory(page, snapshot.categoryKey);
        if (switched) {
          activeCategoryKey = snapshot.categoryKey;
        }
      }

      const parsedPreview = parsePreview(previewText);
      const fullMessage = env.WATCHER_PLAYWRIGHT_FAST_PREVIEW_ONLY
        ? null
        : await this.readLatestConversationMessage(page, snapshot.animDataId, conversationName);
      if (!env.WATCHER_PLAYWRIGHT_FAST_PREVIEW_ONLY && !fullMessage) {
        logger.warn('watcher_playwright_full_message_unavailable', {
          conversationId: snapshot.animDataId,
          conversationName,
          visibleIndex: snapshot.visibleIndex,
        });
        continue;
      }
      const resolvedMessageText =
        normalizePreservedMessageText(fullMessage?.messageText ?? null) ?? parsedPreview.messageText ?? previewText;
      const resolvedSenderName = fullMessage?.senderName ?? parsedPreview.senderName ?? undefined;
      const contentSignature = buildMessageContentSignature({
        conversationId: snapshot.animDataId,
        senderName: resolvedSenderName,
        messageText: resolvedMessageText,
      });

      this.knownSignatures.set(snapshot.animDataId, signature);
      stateChanged = true;

      if (this.shouldSkipRecentContent(contentSignature)) {
        logger.info('watcher_playwright_recent_content_skipped', {
          conversationId: snapshot.animDataId,
          conversationName,
          visibleIndex: snapshot.visibleIndex,
        });
        continue;
      }

      await onEvent({
        source: 'zalo',
        groupExternalId: snapshot.animDataId,
        groupName: conversationName,
        messageExternalId: `${snapshot.animDataId}:${signature}`,
        senderName: resolvedSenderName,
        messageText: resolvedMessageText,
        messageTime: resolveMessageTime(snapshot.timeLabel),
        rawPayload: {
          adapter: 'playwright_conversation_list',
          conversationId: snapshot.animDataId,
          conversationName,
          preview: previewText,
          fullMessageText: fullMessage?.messageText ?? null,
          fullMessageSource: fullMessage ? 'bubble' : env.WATCHER_PLAYWRIGHT_FAST_PREVIEW_ONLY ? 'sidebar_preview_fast' : 'preview',
          fastPreviewOnly: env.WATCHER_PLAYWRIGHT_FAST_PREVIEW_ONLY,
          timeLabel: snapshot.timeLabel,
          unread: snapshot.unread,
          visibleIndex: snapshot.visibleIndex,
          processingScore: score,
          previousSignature: previousSignature ?? null,
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

export function createSourceAdapter(mode: 'mock' | 'adapter'): SourceAdapter {
  return mode === 'mock' ? new MockAdapter() : new PlaywrightConversationListAdapter();
}









