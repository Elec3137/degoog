import { getInstanceSettings, updateInstanceSettings } from "./server-settings";
import { SYNC_KEYS } from "../../shared/sync";

// Instance-wide default browsing prefs, chosen by the owner and applied to
// visitors as a starting point. Each visitor's own client setting always wins,
// so these only fill keys a browser hasn't set yet.
//
// Stored as a JSON string under the `syncedDefaults` key in server-settings.json
// (ServerSettingValue is string | string[] | boolean, so a nested map can't be
// stored directly — we serialize it).
export type SyncedDefaults = Record<string, unknown>;

const DEFAULTS_KEY = "syncedDefaults";

const _whitelist = (raw: SyncedDefaults): SyncedDefaults => {
  const out: SyncedDefaults = {};
  for (const key of SYNC_KEYS) {
    if (key in raw && raw[key] !== undefined && raw[key] !== null) {
      out[key] = raw[key];
    }
  }
  return out;
};

export const readSyncedDefaults = async (): Promise<SyncedDefaults> => {
  const settings = await getInstanceSettings();
  const raw = settings[DEFAULTS_KEY];
  if (typeof raw !== "string" || raw.length === 0) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return _whitelist(parsed as SyncedDefaults);
    }
  } catch {
    // corrupt value -> no defaults
  }
  return {};
};

export const writeSyncedDefaults = async (
  raw: SyncedDefaults,
): Promise<SyncedDefaults> => {
  const next = _whitelist(raw);
  await updateInstanceSettings({ [DEFAULTS_KEY]: JSON.stringify(next) });
  return next;
};
