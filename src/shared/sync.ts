// Single source of truth for which IndexedDB browsing-pref keys the instance
// owner can publish as defaults. Shared by the client (snapshot/apply) and the
// server (whitelist on read/write). These are non-secret UI prefs only.
export const SYNC_KEYS = [
  "engines",
  "theme",
  "open_in_new_tab",
  "display_engine_performance",
  "display_search_suggestions",
  "post_method_enabled",
  "inline_gif_playback",
  "tab-order-saved",
] as const;

export type SyncKey = (typeof SYNC_KEYS)[number];
