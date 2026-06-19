import { describe, test, expect } from "bun:test";
import { settingsIdsForInstalled } from "../../src/server/extensions/store/item-ops";
import { ExtensionStoreType } from "../../src/server/types";

describe("settingsIdsForInstalled", () => {
  test("engine uses canonical -engine suffix, not engine- prefix", () => {
    const ids = settingsIdsForInstalled(ExtensionStoreType.Engine, "acme-foo");
    expect(ids).toContain("acme-foo-engine");
    expect(ids).not.toContain("engine-acme-foo");
  });

  test("transport uses canonical -transport suffix, not transport- prefix", () => {
    const ids = settingsIdsForInstalled(
      ExtensionStoreType.Transport,
      "acme-bar",
    );
    expect(ids).toContain("acme-bar-transport");
    expect(ids).not.toContain("transport-acme-bar-transport");
  });

  test("theme uses canonical -theme suffix, not theme- prefix", () => {
    const ids = settingsIdsForInstalled(ExtensionStoreType.Theme, "acme-zen");
    expect(ids).toContain("acme-zen-theme");
    expect(ids).not.toContain("theme-acme-zen-theme");
  });

  test("autocomplete uses canonical -autocomplete suffix, not autocomplete- prefix", () => {
    const ids = settingsIdsForInstalled(
      ExtensionStoreType.Autocomplete,
      "acme-ac",
    );
    expect(ids).toContain("acme-ac-autocomplete");
    expect(ids).not.toContain("autocomplete-acme-ac");
  });

  test("shortcut uses canonical -shortcut suffix, not shortcut- prefix", () => {
    const ids = settingsIdsForInstalled(
      ExtensionStoreType.Shortcut,
      "acme-do-thing",
    );
    expect(ids).toContain("acme-do-thing-shortcut");
    expect(ids).not.toContain("shortcut-acme-do-thing");
  });

  test("plugin command uses canonical -command suffix, not plugin- prefix", () => {
    const ids = settingsIdsForInstalled(ExtensionStoreType.Plugin, "acme-px");
    expect(ids).toContain("acme-px-command");
    expect(ids).not.toContain("plugin-acme-px");
  });
});
