export const SETTINGS_TABS = [
  "general",
  "server",
  "engines",
  "plugins",
  "transports",
  "autocomplete",
  "themes",
  "store",
  "indexer",
  "shortcuts",
] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number];
