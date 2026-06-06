import type { ExportRow } from "../types/adapter";
import { getAdapter } from "../db/factory";
import { discoverTypes } from "../db/lifecycle";
import { wipeStatsCache } from "./stats";
import { logger } from "../../utils/logger";

export const getKnownTypes = (): string[] => discoverTypes();

export const clearAll = async (): Promise<void> => {
  const adapter = getAdapter();
  const types = discoverTypes();
  await Promise.all(
    types.map(async (type) => {
      try {
        await adapter.clearType(type);
      } catch (err) {
        logger.error("indexer", `clearAll failed for type=${type}`, err);
        throw err;
      }
    }),
  );
  wipeStatsCache();
};

export const sampleRows = async (
  type: string,
  limit = 5,
): Promise<ExportRow[]> => getAdapter().sampleRows(type, limit);
