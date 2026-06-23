import { idbGet, idbSet } from "./db";
import { saveSyncedDefaults } from "./settings-api";
import { getStoredToken } from "./settings-token";
import { SYNC_KEYS } from "../../shared/sync";

declare global {
  interface Window {
    // The instance owner's default browsing prefs, injected by the server.
    __DEGOOG_SYNCED_DEFAULTS__?: Record<string, unknown>;
  }
}

// Apply the owner's injected defaults to IndexedDB, but ONLY for keys this
// browser has not already set. A visitor's own choice always wins, so once a
// key has a local value (set here on first visit, or changed by the visitor)
// the default never overrides it again.
export const applyDefaults = async (): Promise<void> => {
  const defaults = window.__DEGOOG_SYNCED_DEFAULTS__;
  if (!defaults) return;
  for (const key of SYNC_KEYS) {
    const value = defaults[key];
    if (value === undefined || value === null) continue;
    if ((await idbGet<unknown>(key)) !== null) continue;
    await idbSet(key, value);
  }
};

// Snapshot this browser's current browsing prefs and publish them as the
// instance defaults. Owner-only: the POST route is auth-gated.
export const saveDefaults = async (): Promise<boolean> => {
  const blob: Record<string, unknown> = {};
  for (const key of SYNC_KEYS) {
    const value = await idbGet<unknown>(key);
    if (value !== null && value !== undefined) blob[key] = value;
  }
  return saveSyncedDefaults(blob, getStoredToken);
};
