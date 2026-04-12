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

function renderTelegramMessage(payload: NotificationPayload) {
  const safeText = escapeHtml(preserveReadableLines(payload.messageText));
  const safeKeywords = payload.matchedKeywords.map((keyword) => escapeHtml(keyword)).join(', ');

  return [
    '<b>[ZALO ALERT]</b>',
    '',
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
