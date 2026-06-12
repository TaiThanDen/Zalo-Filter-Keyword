import type { NotificationPayload, NotificationProvider } from '@/src/modules/notifications/notifications.types';

type TelegramConfig = {
  botToken: string;
  chatId: string;
  parseMode?: 'HTML' | 'MarkdownV2';
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatVietnamTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

function preserveReadableLines(value: string) {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}

const ZALO_REACTION_COMMANDS = new Set(['/-strong', '/-heart', ':>', ':o', ':-((', ':-h']);
const TRAILING_CLOCK_LINE_PATTERN = /^(?:[01]?\d|2[0-3]):[0-5]\d$/;

function isTrailingReactionLine(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return true;
  }

  if (ZALO_REACTION_COMMANDS.has(trimmed)) {
    return true;
  }

  const compact = trimmed.replace(/\s+/g, '');
  return /[\p{Extended_Pictographic}\uFE0F]/u.test(compact) && !/[\p{L}\p{N}]/u.test(compact);
}

export function sanitizeTelegramMessageText(value: string) {
  const lines = preserveReadableLines(value).split('\n');
  let removedTrailingReaction = false;

  while (lines.length > 0 && isTrailingReactionLine(lines[lines.length - 1] ?? '')) {
    removedTrailingReaction = true;
    lines.pop();
  }

  if (lines.length > 0 && TRAILING_CLOCK_LINE_PATTERN.test((lines[lines.length - 1] ?? '').trim())) {
    lines.pop();
  }

  if (!removedTrailingReaction) {
    return lines.join('\n').trim();
  }

  while (lines.length > 0 && isTrailingReactionLine(lines[lines.length - 1] ?? '')) {
    lines.pop();
  }

  return lines.join('\n').trim();
}

export function renderTelegramMessage(payload: NotificationPayload) {
  const safeText = escapeHtml(sanitizeTelegramMessageText(payload.messageText));
  const safeKeywords = payload.matchedKeywords.map((keyword) => escapeHtml(keyword)).join(', ');

  return [
    `<b>Nhóm:</b> ${escapeHtml(payload.groupName)}`,
    `<b>Người gửi:</b> ${escapeHtml(payload.senderName)}`,
    `<b>Thời gian:</b> ${escapeHtml(formatVietnamTime(payload.messageTime))}`,
    '',
    '<b>Nội dung:</b>',
    safeText,
    '',
    `<b>Từ khóa khớp:</b> ${safeKeywords}`,
  ].join('\n');
}

export const telegramProvider: NotificationProvider = {
  async send(payload, config) {
    const telegramConfig = config as TelegramConfig;
    const response = await fetch(
      `https://api.telegram.org/bot${telegramConfig.botToken}/sendMessage`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: telegramConfig.chatId,
          text: renderTelegramMessage(payload),
          parse_mode: telegramConfig.parseMode ?? 'HTML',
        }),
      },
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Telegram request failed: ${response.status} ${text}`);
    }

    const data = (await response.json()) as { result?: { message_id?: string | number } };

    return {
      ok: true,
      providerMessageId: data.result?.message_id ? String(data.result.message_id) : undefined,
    };
  },
};
