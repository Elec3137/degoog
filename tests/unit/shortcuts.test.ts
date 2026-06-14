import { describe, expect, test } from "bun:test";
import {
  SHORTCUT_ACTIONS,
  parseShortcutsMap,
} from "../../src/shared/shortcuts";
import { formatBinding } from "../../src/client/shortcuts/binding";

describe("shortcuts shared model", () => {
  test("action ids are unique and every action has a default binding", () => {
    const ids = SHORTCUT_ACTIONS.map((action) => action.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const action of SHORTCUT_ACTIONS) {
      if (action.kind === "numeric") {
        expect(
          Boolean(
            action.defaultBinding.ctrl ||
              action.defaultBinding.meta ||
              action.defaultBinding.alt ||
              action.defaultBinding.shift,
          ),
        ).toBe(true);
      } else {
        expect(action.defaultBinding.key).toBeString();
      }
    }
  });

  test("formatBinding renders single and numeric bindings", () => {
    expect(formatBinding({ key: "k", ctrl: true })).toBe("Ctrl + K");
    expect(formatBinding({ key: "ArrowLeft", alt: true })).toBe("Alt + Left");
    expect(formatBinding({ meta: true, alt: true }, "numeric")).toBe(
      "Alt + Meta + 1-9",
    );
  });

  test("parseShortcutsMap validates and normalizes shortcut overrides", () => {
    const actions = [
      ...SHORTCUT_ACTIONS,
      {
        id: "tab-by-number",
        kind: "numeric" as const,
        defaultBinding: { alt: true },
      },
    ];
    expect(
      parseShortcutsMap({
        "focus-search": { key: "k", ctrl: true },
        "tab-by-number": { key: "1", alt: true },
      }, actions),
    ).toEqual({
      "focus-search": { key: "k", ctrl: true },
      "tab-by-number": { alt: true },
    });

    expect(parseShortcutsMap({ unknown: { key: "x" } })).toBeNull();
    expect(parseShortcutsMap({ "focus-search": { ctrl: true } })).toBeNull();
    expect(parseShortcutsMap({ "focus-search": { key: "x", extra: true } })).toBeNull();
    expect(parseShortcutsMap({ "tab-by-number": { key: "1" } }, actions)).toBeNull();
  });
});
