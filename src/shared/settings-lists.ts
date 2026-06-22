export const SEARCH_LIST_FIELDS = [
  "domainBlockList",
  "domainReplaceList",
  "domainScoreList",
] as const;

export type SearchListField = (typeof SEARCH_LIST_FIELDS)[number];
