import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  clearPluginRoutes,
  registerPluginRoutesFromModule,
  resolvePluginFolderId,
} from "../../src/server/extensions/plugin-routes/registry";

const PLUGIN = "degoog-org-official-extensions-jellyfin";

describe("resolvePluginFolderId", () => {
  let entryPath = "";

  beforeAll(async () => {
    entryPath = mkdtempSync(join(tmpdir(), "degoog-plugin-routes-"));
    clearPluginRoutes();
    await registerPluginRoutesFromModule(PLUGIN, entryPath, {
      default: {
        routes: [
          {
            method: "get",
            path: "/thumb",
            handler: async () => new Response("ok"),
          },
        ],
      },
    });
  });

  afterAll(() => {
    clearPluginRoutes();
    rmSync(entryPath, { recursive: true, force: true });
  });

  test("returns exact folder id when registered", () => {
    expect(resolvePluginFolderId(PLUGIN)).toBe(PLUGIN);
  });

  test("maps legacy short id to canonical installed folder", () => {
    expect(resolvePluginFolderId("jellyfin")).toBe(PLUGIN);
  });

  test("returns requested id when no registered match exists", () => {
    expect(resolvePluginFolderId("unknown-plugin")).toBe("unknown-plugin");
  });
});
