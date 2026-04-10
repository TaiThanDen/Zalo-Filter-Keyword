import { MatchDecision, RuleType, type Rule } from "@prisma/client";
import { IMPLEMENTATION_DEFAULTS, PRODUCT_RULES } from "@/src/config/constants";
import { minuteBucket } from "@/src/lib/time";
import { sha256 } from "@/src/lib/crypto";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeText(messageText: string, caseSensitive = false) {
  const normalized = messageText.normalize(IMPLEMENTATION_DEFAULTS.textNormalizationForm).trim().replace(/\s+/g, " ");
  return caseSensitive ? normalized : normalized.toLowerCase();
}

export function buildFingerprint(input: {
  source: string;
  groupExternalId: string;
  senderExternalId?: string | null;
  senderName?: string | null;
  normalizedText: string;
  messageTime: Date;
}) {
  const senderIdentity = input.senderExternalId || input.senderName || "unknown_sender";
  const bucket = minuteBucket(input.messageTime, IMPLEMENTATION_DEFAULTS.dedupeFingerprintBucketMs);

  return sha256(
    [input.source, input.groupExternalId, senderIdentity, input.normalizedText, String(bucket)].join("|"),
  );
}

export function matchRule(messageText: string, rule: Rule) {
  const subject = normalizeText(messageText, rule.caseSensitive);
  const pattern = normalizeText(rule.pattern, rule.caseSensitive);

  if (rule.matchType === "CONTAINS") {
    return subject.includes(pattern);
  }

  const expression = new RegExp(`(^|[^\\p{L}\\p{N}_])${escapeRegExp(pattern)}([^\\p{L}\\p{N}_]|$)`, "u");
  return expression.test(subject);
}

export function evaluateRules(input: {
  isGroupKnown: boolean;
  isGroupEnabled: boolean;
  isDuplicate: boolean;
  messageText: string;
  rules: Rule[];
}) {
  const includeRules = input.rules.filter((rule) => rule.type === RuleType.INCLUDE && rule.isActive);
  const excludeRules = input.rules.filter((rule) => rule.type === RuleType.EXCLUDE && rule.isActive);

  const includeHits = includeRules.filter((rule) => matchRule(input.messageText, rule));
  const excludeHits = excludeRules.filter((rule) => matchRule(input.messageText, rule));

  if (!input.isGroupKnown) {
    return {
      decision: MatchDecision.REJECTED_UNKNOWN_GROUP,
      includeHits: [],
      excludeHits: [],
      reason: "unknown_group",
    };
  }

  if (!input.isGroupEnabled) {
    return {
      decision: MatchDecision.REJECTED_GROUP_DISABLED,
      includeHits: [],
      excludeHits: [],
      reason: "group_disabled",
    };
  }

  if (input.isDuplicate) {
    return {
      decision: MatchDecision.REJECTED_DUPLICATE,
      includeHits: [],
      excludeHits: [],
      reason: "duplicate_message",
    };
  }

  if (PRODUCT_RULES.matchRequireIncludeHit && includeHits.length === 0) {
    return {
      decision: MatchDecision.REJECTED_NO_INCLUDE,
      includeHits: [],
      excludeHits: [],
      reason: input.messageText.trim() ? "no_include_match" : "empty_message",
    };
  }

  if (PRODUCT_RULES.matchExcludeOverridesInclude && excludeHits.length > 0) {
    return {
      decision: MatchDecision.REJECTED_BY_EXCLUDE,
      includeHits,
      excludeHits,
      reason: "excluded_by_rule",
    };
  }

  return {
    decision: MatchDecision.MATCHED,
    includeHits,
    excludeHits,
    reason: "matched",
  };
}
