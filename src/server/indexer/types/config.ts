export interface IndexerConfig {
  maxPerSearch: number;
  maxUrls: number;
  maxHits: number;
  maxAgeDays: number;
  pruneEnabled: boolean;
  fuzzyEnabled: boolean;
  queryLimit: number;
  domainAllowlist: string[];
  domainBlocklist: string[];
  wordBlocklist: string[];
}
