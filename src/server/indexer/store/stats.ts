import type { ServerIndexerStats } from "../../../shared/indexer";
import { getAdapter, isPostgresMode } from "../db/factory";
import { discoverTypes } from "../db/lifecycle";

const STATS_TTL_MS = 10_000;

let _statsCache: { data: ServerIndexerStats; at: number } | null = null;

export const wipeStatsCache = (): void => {
  _statsCache = null;
};

export const getStats = async (): Promise<ServerIndexerStats> => {
  if (_statsCache && Date.now() - _statsCache.at < STATS_TTL_MS) {
    return _statsCache.data;
  }
  const adapter = getAdapter();
  const types = discoverTypes();
  let totalHits = 0;
  let totalUrls = 0;
  let totalQueries = 0;
  const byType: Record<string, number> = {};

  await Promise.all(
    types.map(async (type) => {
      try {
        const counts = await adapter.getTypeCounts(type);
        totalHits += counts.hits;
        totalUrls += counts.urls;
        totalQueries += counts.queries;
        byType[type] = counts.hits;
      } catch (err) {
        const { logger } = await import("../../utils/logger");
        logger.warn("indexer", `getStats failed for type=${type}`, err);
      }
    }),
  );

  const dbSizeBytes = await adapter.totalDbSize(types);

  const data: ServerIndexerStats = {
    totalHits,
    totalUrls,
    totalQueries,
    byType,
    dbSizeBytes,
    backend: isPostgresMode() ? "postgres" : "sqlite",
  };
  _statsCache = { data, at: Date.now() };
  return data;
};
