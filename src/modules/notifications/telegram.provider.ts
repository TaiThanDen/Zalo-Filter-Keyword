import type { NotificationPayload, NotificationProvider } from "@/src/modules/notifications/notifications.types";

type TelegramConfig = {
  botToken: string;
  chatId: string;
  parseMode?: "HTML" | "MarkdownV2";
};

function renderTelegramMessage(payload: NotificationPayload) {
  return [
    "[ZALO ALERT]",
    "",
    `Group: ${payload.groupName}`,
    `Sender: ${payload.senderName}`,
    `Time: ${payload.messageTime}`,
    "",
    "Message:",
    payload.messageText,
    "",
    `Matched: ${payload.matchedKeywords.join(", ")}`,
  ].join("\n");
}

export const telegramProvider: NotificationProvider = {
  async send(payload, config) {
    const telegramConfig = config as TelegramConfig;
    const response = await fetch(
      `https://api.telegram.org/bot${telegramConfig.botToken}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: telegramConfig.chatId,
          text: renderTelegramMessage(payload),
          parse_mode: telegramConfig.parseMode,
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
