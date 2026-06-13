import {
  getActiveWebEngines,
  getEnginesForCustomType,
} from "../extensions/engines/registry";
import type { EngineConfig, SearchEngine } from "../types";
import { asString, getSettings } from "../utils/plugin-settings";

export interface ActiveEngine {
  id: string;
  instance: SearchEngine;
  score: number;
}

export const selectActiveEngines = async (
  type: string,
  config: EngineConfig,
): Promise<ActiveEngine[]> => {
  if (type === "web") return getActiveWebEngines(config);
  return Promise.all(
    (await getEnginesForCustomType(type, config)).map(async (e) => ({
      id: e.id,
      instance: e.instance,
      score: await readEngineScore(e.id),
    })),
  );
};

export const readEngineScore = async (id: string): Promise<number> => {
  const stored = await getSettings(id);
  return Math.max(parseFloat(asString(stored["score"])) || 1, 0.1);
};

const _stableSettings = (settings: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(settings).sort(([a], [b]) => a.localeCompare(b)));

export const engineSettingsFingerprint = async (
  type: string,
  config: EngineConfig,
): Promise<string> => {
  const active = await selectActiveEngines(type, config);
  const rows = await Promise.all(
    active.map(async ({ id }) => [id, _stableSettings(await getSettings(id))]),
  );
  return JSON.stringify(rows);
};
