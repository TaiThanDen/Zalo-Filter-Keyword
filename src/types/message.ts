export type MatchedRuleSnapshot = {
  id: string;
  pattern: string;
  type: "INCLUDE" | "EXCLUDE";
  matchType: "CONTAINS" | "WHOLE_WORD";
};
