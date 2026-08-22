import assert from "node:assert/strict";
import test from "node:test";
import { ingestMessagesRequestSchema } from "@/src/modules/messages/messages.schemas";

const message = {
  source: "zalo",
  groupExternalId: "g1",
  messageExternalId: "g1:m1",
  messageText: "Cần tuyển PB",
  messageTime: "2026-08-23T00:30:00.000Z",
};

test("watcher ingest accepts a micro-batch of up to ten messages", () => {
  const parsed = ingestMessagesRequestSchema.parse({ messages: [message, { ...message, messageExternalId: "g1:m2" }] });
  assert.ok("messages" in parsed);
  assert.equal(parsed.messages.length, 2);
});

test("watcher ingest keeps backward compatibility with a single message", () => {
  const parsed = ingestMessagesRequestSchema.parse(message);
  assert.ok(!("messages" in parsed));
  assert.equal(parsed.groupExternalId, "g1");
});

test("watcher ingest rejects batches larger than ten messages", () => {
  assert.throws(() => ingestMessagesRequestSchema.parse({ messages: Array.from({ length: 11 }, () => message) }));
});
