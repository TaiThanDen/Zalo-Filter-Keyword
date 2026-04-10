import test from "node:test";
import assert from "node:assert/strict";
import { buildFingerprint, evaluateRules, matchRule, normalizeText } from "@/src/modules/matching/matching.service";

test("normalizeText trims, collapses spaces, and lowercases by default", () => {
  assert.equal(normalizeText("  PB   Support  Mascot  "), "pb support mascot");
});

test("matchRule whole-word does not match larger token", () => {
  assert.equal(
    matchRule("supplies list", {
      id: "1",
      type: "EXCLUDE",
      pattern: "sup",
      matchType: "WHOLE_WORD",
      caseSensitive: false,
      isActive: true,
      note: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    false,
  );
});

test("buildFingerprint is stable for same normalized payload", () => {
  const fingerprintA = buildFingerprint({
    source: "zalo",
    groupExternalId: "123",
    senderExternalId: "u1",
    senderName: null,
    normalizedText: "pb support mascot",
    messageTime: new Date("2026-04-08T10:15:22.000Z"),
  });

  const fingerprintB = buildFingerprint({
    source: "zalo",
    groupExternalId: "123",
    senderExternalId: "u1",
    senderName: null,
    normalizedText: "pb support mascot",
    messageTime: new Date("2026-04-08T10:15:58.000Z"),
  });

  assert.equal(fingerprintA, fingerprintB);
});

test("evaluateRules rejects unknown group before matching", () => {
  const result = evaluateRules({
    isGroupKnown: false,
    isGroupEnabled: false,
    isDuplicate: false,
    messageText: "PB can support mascot",
    rules: [],
  });

  assert.equal(result.reason, "unknown_group");
});
