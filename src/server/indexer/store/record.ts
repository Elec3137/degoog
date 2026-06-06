import type { SearchResult, ScoredResult } from "../../types";
import { getIndexerConfig } from "../config/load";
import { shouldIndex } from "../filters/filters";
import { enqueue } from "../queue/queue";
import { DEGOOG_ENGINE_NAME, normalizeQuery } from "./mapper";

export const recordResults = async (
  query: string,
  engineType: string,
  results: SearchResult[],
): Promise<void> => {
  if (!query || results.length === 0) return;
  const queryNorm = normalizeQuery(query);
  if (!queryNorm) return;
  const cfg = await getIndexerConfig();
  const { recorderFor } = await import("../recorders");
  const allowed = results.filter((r) => shouldIndex(r, cfg));
  const capped = cfg.maxPerSearch > 0 ? allowed.slice(0, cfg.maxPerSearch) : allowed;
  const recorder = recorderFor(engineType);
  const rows = recorder.toRows(queryNorm, engineType, capped);
  if (rows.length > 0) enqueue(rows);
};

export const maybeIndex = (
  enabled: boolean,
  query: string,
  engineType: string,
  results: ScoredResult[],
): boolean => {
  if (!enabled) return false;
  const toIndex = results.filter(
    (r) =>
      r.source !== DEGOOG_ENGINE_NAME &&
      !(r.sources ?? []).includes(DEGOOG_ENGINE_NAME),
  );
  if (toIndex.length === 0) return false;
  queueMicrotask(() => void recordResults(query, engineType, toIndex));
  return true;
};
