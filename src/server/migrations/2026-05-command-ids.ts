import { readFile, writeFile, mkdir, rename, readdir } from "fs/promises";
import { dirname, join } from "path";
import { logger } from "../utils/logger";
import { pluginSettingsFile } from "../utils/paths";
import { folderNameForItem } from "../utils/extension-id";
import { makeExtID } from "../extensions/extension-id";
import {
  getReposPath,
  readReposData,
  writeReposData,
} from "../extensions/store/persistence";

export const MIGRATION_VERSION = 52027 as const;
const SCHEMA_KEY = "__schemaVersion";

const LEGACY_PLUGIN_PREFIX = "plugin-";

const COMMANDS_BUILTINS_DIR = join(
  process.cwd(),
  "src",
  "server",
  "extensions",
  "commands",
  "builtins",
);

const AMBIGUOUS_BARE_KEYS = new Set<string>(["wikipedia"]);

type SettingsValue = string | string[] | boolean;
type SettingsStore = Record<
  string,
  Record<string, SettingsValue> | number | undefined
> & { [SCHEMA_KEY]?: number };

const _readJson = async (path: string): Promise<SettingsStore | null> => {
  try {
    return JSON.parse(await readFile(path, "utf-8")) as SettingsStore;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      logger.warn("migration:command-ids", `failed to read ${path}`, err);
    }
    return null;
  }
};

const _writeAtomic = async (path: string, contents: string): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await writeFile(tmp, contents, "utf-8");
  await rename(tmp, path);
};

const _builtinFolders = async (): Promise<string[]> => {
  try {
    const entries = await readdir(COMMANDS_BUILTINS_DIR, {
      withFileTypes: true,
    });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
};

const _backupPath = (path: string): string =>
  `${path}.bak-${new Date().toISOString().replace(/[:.]/g, "-")}`;

const _merge = (
  store: SettingsStore,
  legacyKey: string,
  canonicalId: string,
): boolean => {
  if (legacyKey === canonicalId) return false;
  const legacyVal = store[legacyKey] as Record<string, SettingsValue> | undefined;
  if (!legacyVal) return false;
  const canonicalVal =
    (store[canonicalId] as Record<string, SettingsValue> | undefined) ?? {};
  store[canonicalId] = { ...legacyVal, ...canonicalVal };
  delete store[legacyKey];
  logger.info("migration:command-ids", `rewrote "${legacyKey}" -> "${canonicalId}"`);
  return true;
};

const _syncInstalledAs = async (): Promise<boolean> => {
  const data = await readReposData();
  let changed = false;

  for (const item of data.installed) {
    const itemPath = item.itemPath.replace(/\/$/, "");
    const expected = folderNameForItem(item.repoUrl, itemPath);
    if (item.installedAs === expected) continue;
    logger.info(
      "migration:command-ids",
      `installedAs "${item.installedAs}" -> "${expected}" (${itemPath})`,
    );
    item.installedAs = expected;
    changed = true;
  }

  if (!changed) return false;

  const reposPath = getReposPath();
  try {
    const raw = await readFile(reposPath, "utf-8");
    await writeFile(_backupPath(reposPath), raw, "utf-8");
  } catch (err) {
    logger.error(
      "migration:command-ids",
      "failed to write repos.json backup, aborting installedAs sync",
      err,
    );
    return false;
  }

  await writeReposData(data);
  return true;
};

/**
 * Standardize command settings keys onto the canonical `<folder>-command`
 * scheme used by every other extension kind. Moves leftover `plugin-<folder>`
 * keys (from the previous canonical-ids release) and bare built-in command
 * keys (e.g. `help`) to their `-command` form. Bare keys that collide with a
 * non-command extension (e.g. `wikipedia`, also an engine) are skipped.
 * Also rewrites stale `installedAs` values in repos.json to match the
 * canonical `{author}-{repo}-{item}` folder names used by the store.
 * Idempotent; shares `__schemaVersion` with canonical-ids and runs after it.
 */
export const runCommandIds052027 = async (): Promise<void> => {
  await _syncInstalledAs();

  const settingsPath = pluginSettingsFile();
  const store = await _readJson(settingsPath);
  if (!store) return;

  const existingVersion =
    typeof store[SCHEMA_KEY] === "number" ? (store[SCHEMA_KEY] as number) : 0;
  if (existingVersion >= MIGRATION_VERSION) return;

  const builtinCommands = new Set(await _builtinFolders());
  const keys = Object.keys(store).filter((k) => !k.startsWith("__"));
  const rewrites: Array<{ legacyKey: string; canonicalId: string }> = [];

  for (const key of keys) {
    if (key.startsWith(LEGACY_PLUGIN_PREFIX)) {
      const folder = key.slice(LEGACY_PLUGIN_PREFIX.length);
      if (folder) rewrites.push({ legacyKey: key, canonicalId: makeExtID(folder, "command") });
      continue;
    }
    if (builtinCommands.has(key) && !AMBIGUOUS_BARE_KEYS.has(key)) {
      rewrites.push({ legacyKey: key, canonicalId: makeExtID(key, "command") });
    }
  }

  if (rewrites.length === 0) {
    store[SCHEMA_KEY] = MIGRATION_VERSION;
    await _writeAtomic(settingsPath, JSON.stringify(store, null, 2));
    return;
  }

  const backup = _backupPath(settingsPath);
  try {
    const raw = await readFile(settingsPath, "utf-8");
    await writeFile(backup, raw, "utf-8");
    logger.info("migration:command-ids", `wrote backup ${backup}`);
  } catch (err) {
    logger.error("migration:command-ids", "failed to write backup, aborting rewrite", err);
    return;
  }

  for (const { legacyKey, canonicalId } of rewrites) {
    _merge(store, legacyKey, canonicalId);
  }

  store[SCHEMA_KEY] = MIGRATION_VERSION;
  await _writeAtomic(settingsPath, JSON.stringify(store, null, 2));
};
