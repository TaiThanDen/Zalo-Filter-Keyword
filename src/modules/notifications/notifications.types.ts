export type NotificationPayload = {
  groupName: string;
  senderName: string;
  messageText: string;
  messageTime: string;
  matchedKeywords: string[];
};

export type SendResult = {
  ok: boolean;
  providerMessageId?: string;
};

export interface NotificationProvider {
  send(payload: NotificationPayload, config: unknown): Promise<SendResult>;
}
