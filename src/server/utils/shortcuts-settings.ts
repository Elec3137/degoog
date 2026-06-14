import { getSettings, setSettings, type SettingValue } from "./plugin-settings";
import type { ShortcutBinding } from "../../shared/shortcuts";
import { parseShortcutsMap, type ShortcutActionMeta } from "../../shared/shortcuts";

export interface ShortcutsSettings {
  bindings: Record<string, ShortcutBinding>;
}

const DEFAULT_SETTINGS: ShortcutsSettings = { bindings: {} };
const SETTINGS_ID = "shortcuts";

let cache: ShortcutsSettings | null = null;

export const clearShortcutsSettingsCache = (): void => {
  cache = null;
};

export const readShortcutsSettings = async (): Promise<ShortcutsSettings> => {
  if (cache) return cache;
  const stored = await getSettings(SETTINGS_ID);
  const bindings: Record<string, ShortcutBinding> = {};
  for (const [id, raw] of Object.entries(stored)) {
    if (typeof raw !== "string") continue;
    try {
      bindings[id] = JSON.parse(raw) as ShortcutBinding;
    } catch {
      continue;
    }
  }
  cache = { bindings };
  return cache;
};

export const writeShortcutsSettings = async (
  settings: ShortcutsSettings,
): Promise<void> => {
  const stored: Record<string, SettingValue> = {};
  for (const [id, binding] of Object.entries(settings.bindings)) {
    stored[id] = JSON.stringify(binding);
  }
  await setSettings(SETTINGS_ID, stored);
  cache = settings;
};

export const saveShortcutBindings = async (
  value: unknown,
  actions: ShortcutActionMeta[],
): Promise<Record<string, ShortcutBinding> | null> => {
  const bindings = parseShortcutsMap(value, actions);
  if (!bindings) return null;
  await writeShortcutsSettings({ bindings });
  return bindings;
};
