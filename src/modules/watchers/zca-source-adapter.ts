import { env } from "@/src/config/env";
import { logger } from "@/src/lib/logger";
import type {
  DiscoveredSourceGroup,
  SourceAdapter,
  SourceMessageEvent,
} from "@/src/modules/watchers/source-adapters";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  CloseReason,
  LoginQRCallbackEventType,
  ThreadType,
  Zalo,
  type API,
  type Credentials,
  type Message,
} from "zca-js";

type ZcaMessageLike = {
  type: ThreadType;
  threadId: string;
  isSelf: boolean;
  data: {
    actionId?: string;
    cliMsgId?: string;
    content: unknown;
    dName?: string;
    msgId?: string;
    msgType?: string;
    notify?: string;
    status?: number;
    ts?: string;
    uidFrom?: string;
  };
};

function normalizeText(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value
    .replace(/\u00a0/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return normalized || null;
}

export function toStoredZaloGroupId(zcaGroupId: string) {
  return /^\d+$/.test(zcaGroupId) ? `g${zcaGroupId}` : zcaGroupId;
}

function toZcaGroupId(storedGroupId: string) {
  return /^g\d+$/.test(storedGroupId) ? storedGroupId.slice(1) : storedGroupId;
}

export function extractZcaMessageText(content: unknown, notify?: string) {
  const plainText = normalizeText(content);
  if (plainText) {
    return plainText;
  }

  if (!content || typeof content !== "object" || Array.isArray(content)) {
    return normalizeText(notify);
  }

  const record = content as Record<string, unknown>;
  const parts = [record.title, record.description, record.href, notify]
    .map(normalizeText)
    .filter((value): value is string => Boolean(value));

  return parts.length > 0 ? Array.from(new Set(parts)).join("\n") : null;
}

export function resolveZcaMessageTime(timestamp: string | undefined, fallbackNow = Date.now()) {
  const numericTimestamp = Number(timestamp);

  if (!Number.isFinite(numericTimestamp) || numericTimestamp <= 0) {
    return new Date(fallbackNow).toISOString();
  }

  const timestampMs = numericTimestamp < 1_000_000_000_000 ? numericTimestamp * 1_000 : numericTimestamp;
  const resolved = new Date(timestampMs);

  return Number.isNaN(resolved.getTime()) ? new Date(fallbackNow).toISOString() : resolved.toISOString();
}

export function mapZcaGroupMessage(
  message: ZcaMessageLike,
  groupName?: string,
): SourceMessageEvent | null {
  if (message.type !== ThreadType.Group || message.isSelf || !message.threadId) {
    return null;
  }

  const messageText = extractZcaMessageText(message.data.content, message.data.notify);
  if (!messageText) {
    return null;
  }

  const messageId = message.data.msgId ?? message.data.cliMsgId ?? message.data.actionId;
  const groupExternalId = toStoredZaloGroupId(message.threadId);

  return {
    source: "zalo",
    groupExternalId,
    groupName,
    messageExternalId: messageId ? `${groupExternalId}:${messageId}` : undefined,
    senderExternalId: message.data.uidFrom,
    senderName: normalizeText(message.data.dName) ?? undefined,
    messageText,
    messageTime: resolveZcaMessageTime(message.data.ts),
    rawPayload: {
      adapter: "zca-js",
      actionId: message.data.actionId ?? null,
      cliMsgId: message.data.cliMsgId ?? null,
      msgId: message.data.msgId ?? null,
      msgType: message.data.msgType ?? null,
      status: message.data.status ?? null,
    },
  };
}

function isCredentials(value: unknown): value is Credentials {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<Credentials>;
  return Boolean(candidate.imei && candidate.userAgent && candidate.cookie);
}

function chunk<T>(values: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

export class ZcaSourceAdapter implements SourceAdapter {
  private api: API | null = null;
  private paused = false;
  private stopped = true;
  private connected = false;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private onEvent: ((event: SourceMessageEvent) => Promise<void>) | null = null;
  private onConnectionStatus: ((online: boolean) => Promise<void>) | null = null;
  private deliveryChain = Promise.resolve();
  private statusChain = Promise.resolve();
  private readonly groupNames = new Map<string, string>();

  async start(onEvent: (event: SourceMessageEvent) => Promise<void>) {
    if (!this.stopped) {
      throw new Error("ZCA source adapter is already started");
    }

    this.stopped = false;
    this.onEvent = onEvent;
    await this.connect(true);
  }

  async stop() {
    this.stopped = true;
    this.connected = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.api?.listener.stop();
    this.api = null;
    await Promise.all([this.deliveryChain, this.statusChain]);
  }

  async setPaused(paused: boolean) {
    this.paused = paused;
    logger.info(paused ? "watcher_zca_paused" : "watcher_zca_resumed", {
      listenerConnected: this.connected,
    });
  }

  setConnectionStatusHandler(handler: (online: boolean) => Promise<void>) {
    this.onConnectionStatus = handler;
  }

  isHealthy() {
    return this.connected;
  }

  async seedKnownGroups(groups: DiscoveredSourceGroup[]) {
    for (const group of groups) {
      this.groupNames.set(toZcaGroupId(group.externalId), group.name);
    }
  }

  async seedRules() {
    // Keyword rules are evaluated by the backend after the event is ingested.
  }

  async listGroups() {
    if (!this.api) {
      return this.cachedGroups();
    }

    const response = await this.api.getAllGroups();
    const groupIds = Object.keys(response.gridVerMap);

    for (const groupIdBatch of chunk(groupIds, env.WATCHER_ZCA_GROUP_INFO_BATCH_SIZE)) {
      try {
        const groupInfo = await this.api.getGroupInfo(groupIdBatch);

        for (const [groupId, group] of Object.entries(groupInfo.gridInfoMap)) {
          const name = normalizeText(group.name);
          if (name) {
            this.groupNames.set(groupId, name);
          }
        }
      } catch (error) {
        logger.warn("watcher_zca_group_info_batch_failed", {
          batchSize: groupIdBatch.length,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    for (const groupId of groupIds) {
      if (!this.groupNames.has(groupId)) {
        this.groupNames.set(groupId, groupId);
      }
    }

    return this.cachedGroups();
  }

  private cachedGroups() {
    return Array.from(this.groupNames, ([externalId, name]) => ({
      source: "zalo" as const,
      externalId: toStoredZaloGroupId(externalId),
      name,
    })).sort((left, right) => left.name.localeCompare(right.name, "vi"));
  }

  private async connect(allowQrLogin: boolean) {
    const api = await this.login(allowQrLogin);
    this.api = api;

    api.listener.on("connected", () => {
      this.connected = true;
      this.reconnectAttempts = 0;
      logger.info("watcher_zca_listener_connected");
      this.queueConnectionStatus(true);
    });

    api.listener.on("disconnected", (code, reason) => {
      this.connected = false;
      logger.warn("watcher_zca_listener_disconnected", { code, reason });
      this.queueConnectionStatus(false);
    });

    api.listener.on("closed", (code, reason) => {
      if (this.stopped || code === CloseReason.ManualClosure) {
        return;
      }

      logger.warn("watcher_zca_listener_closed", { code, reason });
      this.scheduleReconnect();
    });

    api.listener.on("error", (error) => {
      logger.warn("watcher_zca_listener_error", {
        error: error instanceof Error ? error.message : String(error),
      });
    });

    api.listener.on("message", (message) => {
      this.queueMessage(message);
    });

    api.listener.start({ retryOnClose: true });
  }

  private async login(allowQrLogin: boolean) {
    const zalo = new Zalo({ logging: false, selfListen: false });
    const credentials = await this.readCredentials();

    if (credentials) {
      try {
        const api = await zalo.login(credentials);
        logger.info("watcher_zca_credentials_login_succeeded");
        return api;
      } catch (error) {
        logger.warn("watcher_zca_credentials_login_failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (!allowQrLogin) {
      throw new Error("Stored Zalo credentials are unavailable or expired; QR login is required");
    }

    await mkdir(dirname(env.WATCHER_ZCA_QR_FILE), { recursive: true });
    logger.warn("watcher_zca_qr_login_required", { qrFile: env.WATCHER_ZCA_QR_FILE });

    let capturedCredentials: Credentials | null = null;
    const api = await zalo.loginQR({ qrPath: env.WATCHER_ZCA_QR_FILE }, (event) => {
      if (event.type === LoginQRCallbackEventType.QRCodeGenerated) {
        void event.actions.saveToFile(env.WATCHER_ZCA_QR_FILE)
          .then(() => chmod(env.WATCHER_ZCA_QR_FILE, 0o600))
          .then(() => {
            logger.warn("watcher_zca_qr_ready", { qrFile: env.WATCHER_ZCA_QR_FILE });
          })
          .catch((error) => {
            logger.error("watcher_zca_qr_write_failed", {
              error: error instanceof Error ? error.message : String(error),
            });
          });
        return;
      }

      if (event.type === LoginQRCallbackEventType.QRCodeExpired) {
        logger.warn("watcher_zca_qr_expired");
        event.actions.retry();
        return;
      }

      if (event.type === LoginQRCallbackEventType.QRCodeScanned) {
        logger.info("watcher_zca_qr_scanned", { displayName: event.data.display_name });
        return;
      }

      if (event.type === LoginQRCallbackEventType.GotLoginInfo) {
        capturedCredentials = event.data;
      }
    });

    const context = api.getContext();
    const resolvedCredentials: Credentials = capturedCredentials ?? {
      cookie: context.cookie.toJSON()?.cookies ?? [],
      imei: context.imei,
      userAgent: context.userAgent,
      language: context.language,
    };

    await this.writeCredentials(resolvedCredentials);
    logger.info("watcher_zca_qr_login_succeeded");
    return api;
  }

  private async readCredentials() {
    try {
      const parsed: unknown = JSON.parse(await readFile(env.WATCHER_ZCA_CREDENTIALS_FILE, "utf8"));
      if (!isCredentials(parsed)) {
        logger.warn("watcher_zca_credentials_invalid", { path: env.WATCHER_ZCA_CREDENTIALS_FILE });
        return null;
      }
      return parsed;
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : null;
      if (code !== "ENOENT") {
        logger.warn("watcher_zca_credentials_read_failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return null;
    }
  }

  private async writeCredentials(credentials: Credentials) {
    const credentialsPath = env.WATCHER_ZCA_CREDENTIALS_FILE;
    const temporaryPath = `${credentialsPath}.tmp`;
    await mkdir(dirname(credentialsPath), { recursive: true });
    await writeFile(temporaryPath, JSON.stringify(credentials), { encoding: "utf8", mode: 0o600 });
    await rename(temporaryPath, credentialsPath);
    await chmod(credentialsPath, 0o600);
  }

  private queueMessage(message: Message) {
    if (this.paused || this.stopped || !this.onEvent) {
      return;
    }

    const payload = mapZcaGroupMessage(message, this.groupNames.get(message.threadId));
    if (!payload) {
      return;
    }

    const deliver = async () => {
      await this.onEvent?.(payload);
    };

    this.deliveryChain = this.deliveryChain.then(deliver, deliver).catch((error) => {
      logger.error("watcher_zca_message_dispatch_failed", {
        messageExternalId: payload.messageExternalId,
        groupExternalId: payload.groupExternalId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  private queueConnectionStatus(online: boolean) {
    if (!this.onConnectionStatus) {
      return;
    }

    const notify = async () => {
      await this.onConnectionStatus?.(online);
    };

    this.statusChain = this.statusChain.then(notify, notify).catch((error) => {
      logger.warn("watcher_zca_connection_status_failed", {
        online,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  private scheduleReconnect() {
    if (this.stopped || this.reconnectTimer) {
      return;
    }

    this.reconnectAttempts += 1;
    const delayMs = Math.min(
      env.WATCHER_ZCA_RECONNECT_BASE_DELAY_MS * 2 ** (this.reconnectAttempts - 1),
      env.WATCHER_ZCA_RECONNECT_MAX_DELAY_MS,
    );

    logger.warn("watcher_zca_reconnect_scheduled", {
      attempt: this.reconnectAttempts,
      delayMs,
    });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect(false).catch((error) => {
        logger.error("watcher_zca_reconnect_failed", {
          attempt: this.reconnectAttempts,
          error: error instanceof Error ? error.message : String(error),
        });
        this.scheduleReconnect();
      });
    }, delayMs);
  }
}
