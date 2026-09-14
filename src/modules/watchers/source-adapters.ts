import sampleMessages from "@/fixtures/sample-messages.json";
import { ZcaSourceAdapter } from "@/src/modules/watchers/zca-source-adapter";

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

export type DiscoveredSourceGroup = {
  source: "zalo";
  externalId: string;
  name: string;
};

export type SourceRule = {
  id: string;
  type: "INCLUDE" | "EXCLUDE";
  pattern: string;
  matchType: "CONTAINS" | "WHOLE_WORD";
  caseSensitive: boolean;
};

export type SourceAdapter = {
  start(onEvent: (event: SourceMessageEvent) => Promise<void>): Promise<void>;
  stop(): Promise<void>;
  setPaused?(paused: boolean): Promise<void>;
  listGroups(): Promise<DiscoveredSourceGroup[]>;
  seedKnownGroups?(groups: DiscoveredSourceGroup[]): Promise<void>;
  seedRules?(rules: SourceRule[]): Promise<void>;
  setConnectionStatusHandler?(handler: (online: boolean) => Promise<void>): void;
  isHealthy?(): boolean;
};

export class MockAdapter implements SourceAdapter {
  private paused = false;

  async start(onEvent: (event: SourceMessageEvent) => Promise<void>) {
    if (this.paused) {
      return;
    }

    for (const event of sampleMessages as SourceMessageEvent[]) {
      if (this.paused) {
        break;
      }
      await onEvent(event);
    }
  }

  async stop() {}

  async setPaused(paused: boolean) {
    this.paused = paused;
  }

  async listGroups() {
    const groups = new Map<string, DiscoveredSourceGroup>();

    for (const event of sampleMessages as SourceMessageEvent[]) {
      if (!event.groupExternalId) {
        continue;
      }

      groups.set(event.groupExternalId, {
        source: "zalo",
        externalId: event.groupExternalId,
        name: event.groupName ?? event.groupExternalId,
      });
    }

    return Array.from(groups.values());
  }

  async seedKnownGroups() {}
}

export function createSourceAdapter(mode: "mock" | "adapter"): SourceAdapter {
  return mode === "mock" ? new MockAdapter() : new ZcaSourceAdapter();
}
