import type { ShortcutBinding, ShortcutKind } from "../../shared/shortcuts";
import type { Shortcut } from "../utils/keyboard-shortcuts";

const PURE_MODIFIERS = new Set(["Control", "Alt", "Shift", "Meta"]);

const KEY_LABELS: Record<string, string> = {
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  " ": "Space",
  Escape: "Esc",
  Enter: "Enter",
};

export const isModifierOnly = (e: KeyboardEvent): boolean =>
  PURE_MODIFIERS.has(e.key);

export const eventToBinding = (e: KeyboardEvent): ShortcutBinding => ({
  key: e.key,
  ctrl: e.ctrlKey,
  meta: e.metaKey,
  alt: e.altKey,
  shift: e.shiftKey,
});

export const eventToModifiers = (e: KeyboardEvent): ShortcutBinding => ({
  ctrl: e.ctrlKey,
  meta: e.metaKey,
  alt: e.altKey,
  shift: e.shiftKey,
});

const _keyLabel = (key: string): string => {
  if (KEY_LABELS[key]) return KEY_LABELS[key];
  return key.length === 1 ? key.toUpperCase() : key;
};

export const formatBinding = (
  binding: ShortcutBinding,
  kind: ShortcutKind = "single",
): string => {
  const parts: string[] = [];
  if (binding.ctrl) parts.push("Ctrl");
  if (binding.alt) parts.push("Alt");
  if (binding.shift) parts.push("Shift");
  if (binding.meta) parts.push("Meta");
  if (kind === "numeric") {
    parts.push("1-9");
  } else if (binding.key) {
    parts.push(_keyLabel(binding.key));
  }
  return parts.join(" + ");
};

export const hasBinding = (binding: ShortcutBinding, kind: ShortcutKind): boolean => {
  if (kind === "numeric") {
    return Boolean(binding.ctrl || binding.alt || binding.shift || binding.meta);
  }
  return Boolean(binding.key);
};

export const toShortcut = (
  binding: ShortcutBinding,
  rest: Omit<Shortcut, "key" | "ctrl" | "meta" | "alt" | "shift">,
): Shortcut => ({
  key: binding.key ?? "",
  ctrl: binding.ctrl,
  meta: binding.meta,
  alt: binding.alt,
  shift: binding.shift,
  ...rest,
});
