export type RuleSummary = {
  id: string;
  type: "INCLUDE" | "EXCLUDE";
  pattern: string;
  matchType: "CONTAINS" | "WHOLE_WORD";
  caseSensitive: boolean;
  isActive: boolean;
  note: string | null;
};
