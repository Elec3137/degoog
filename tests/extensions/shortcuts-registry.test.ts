import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const dir = join(tmpdir(), "degoog-shortcuts-registry-tests");
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
process.env.DEGOOG_SHORTCUTS_DIR = dir;
process.env.DEGOOG_PLUGIN_SETTINGS_FILE = join(dir, "plugin-settings.json");

import {
  getClientShortcuts,
  getShortcutActions,
  getShortcutModuleSource,
  initShortcutsRegistry,
} from "../../src/server/extensions/shortcuts/registry";

describe("shortcuts registry", () => {
  beforeAll(async () => {
    writeFileSync(
      join(dir, "focus-first.js"),
      `export default {
  name: "Focus first",
  description: "Focuses the first result.",
  defaultBinding: { key: "j", alt: true },
  run() {}
};`,
    );
    await initShortcutsRegistry();
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.DEGOOG_SHORTCUTS_DIR;
  });

  test("loads flat shortcut files with canonical -shortcut ids", () => {
    const actions = getShortcutActions();
    expect(actions).toContainEqual({
      id: "focus-first-shortcut",
      kind: "single",
      defaultBinding: { key: "j", alt: true },
      displayName: "Focus first",
      description: "Focuses the first result.",
      source: "plugin",
      editable: true,
    });
  });

  test("exposes client module urls", async () => {
    const client = await getClientShortcuts();
    expect(client[0].moduleUrl).toBe("/api/shortcuts/modules/focus-first-shortcut.js");
    const source = await getShortcutModuleSource("focus-first-shortcut");
    expect(source).toContain("Focus first");
  });
});
