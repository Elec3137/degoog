import { saveField, saveBatch } from "../../utils/settings-api";
import { boolStr, el } from "./fields";
import { serializeScoreRows } from "./domain-score";

const t = window.scopedT("core");

const TOGGLE_KEYS = [
  "proxy-enabled",
  "image-proxy-allow-local",
  "languages-enabled",
  "rate-limit-enabled",
  "rate-limit-suggest-enabled",
  "streaming-enabled",
  "streaming-auto-retry",
  "domain-block-enabled",
  "domain-block-ui-enabled",
  "domain-replace-enabled",
  "domain-replace-ui-enabled",
  "domain-score-enabled",
  "domain-score-ui-enabled",
  "api-key-search-enabled",
  "api-key-suggest-enabled",
  "honeypot-enabled",
  "honeypot-css-check",
  "degoog-indexer-enabled",
] as const;

const RL_SEARCH_KEYS = [
  "rateLimitBurstWindow",
  "rateLimitBurstMax",
  "rateLimitLongWindow",
  "rateLimitLongMax",
] as const;

const RL_SUGGEST_KEYS = [
  "rateLimitSuggestBurstWindow",
  "rateLimitSuggestBurstMax",
  "rateLimitSuggestLongWindow",
  "rateLimitSuggestLongMax",
  "acDebounceMs",
] as const;

const _toCamel = (s: string): string =>
  s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

const _mkBtn = (): HTMLButtonElement => {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "settings-field-save-btn";
  btn.hidden = true;
  btn.textContent = t("settings-page.actions.save");
  return btn;
};

const _bindBtn = (
  btn: HTMLButtonElement,
  save: () => Promise<boolean>,
): void => {
  btn.addEventListener("click", async () => {
    const prev = btn.textContent ?? "";
    btn.disabled = true;
    const ok = await save();
    if (ok) {
      btn.textContent = t("settings-page.server.saved");
      setTimeout(() => {
        btn.hidden = true;
        btn.textContent = prev;
        btn.disabled = false;
      }, 1200);
    } else {
      btn.textContent = t("settings-page.server.save-failed-network");
      btn.disabled = false;
      setTimeout(() => { btn.textContent = prev; }, 1500);
    }
  });
};

export const bindToggleAutoSave = (getToken: () => string | null): void => {
  for (const id of TOGGLE_KEYS) {
    const input = document.getElementById(`settings-${id}`) as HTMLInputElement | null;
    if (!input) continue;
    const key = _toCamel(id);
    input.addEventListener("change", () => {
      void saveField(key, boolStr(id), getToken);
    });
  }
};

const _rlPayload = (
  keys: readonly string[],
): Record<string, string> => {
  const payload: Record<string, string> = {};
  for (const key of keys) {
    const domId = key.replace(/([A-Z])/g, (c) => `-${c.toLowerCase()}`);
    const input = el(domId);
    payload[key] = input?.value.trim() || input?.placeholder || "";
  }
  return payload;
};

export const injectFieldSaveBtns = (getToken: () => string | null): void => {
  const fields = document.querySelectorAll<HTMLElement>("[data-save-key]");
  for (const field of fields) {
    const key = field.dataset.saveKey;
    if (!key) continue;
    const btn = _mkBtn();
    field.insertAdjacentElement("afterend", btn);
    field.addEventListener("input", () => { btn.hidden = false; });
    if (field instanceof HTMLInputElement && field.type === "number") {
      field.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); btn.click(); }
      });
    }
    _bindBtn(btn, () => saveField(key, (field as HTMLInputElement).value, getToken));
  }

  const rlSearchGroup = document.getElementById("settings-rate-limit-options");
  if (rlSearchGroup) {
    const btn = _mkBtn();
    rlSearchGroup.appendChild(btn);
    rlSearchGroup.querySelectorAll<HTMLInputElement>('input[type="number"]').forEach((input) => {
      input.addEventListener("input", () => { btn.hidden = false; });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); btn.click(); }
      });
    });
    _bindBtn(btn, () => saveBatch(_rlPayload(RL_SEARCH_KEYS), getToken));
  }

  const rlSuggestGroup = document.getElementById("settings-rate-limit-suggest-options");
  if (rlSuggestGroup) {
    const btn = _mkBtn();
    rlSuggestGroup.appendChild(btn);
    rlSuggestGroup.querySelectorAll<HTMLInputElement>('input[type="number"]').forEach((input) => {
      input.addEventListener("input", () => { btn.hidden = false; });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); btn.click(); }
      });
    });
    _bindBtn(btn, () => saveBatch(_rlPayload(RL_SUGGEST_KEYS), getToken));
  }

  const scoreSection = document.getElementById("settings-domain-score-rows");
  if (scoreSection) {
    const btn = _mkBtn();
    scoreSection.insertAdjacentElement("afterend", btn);
    const markDirty = (): void => { btn.hidden = false; };
    new MutationObserver(markDirty).observe(scoreSection, { childList: true, subtree: true });
    document.getElementById("settings-domain-score-add")?.addEventListener("click", markDirty);
    _bindBtn(btn, () => saveField("domainScoreList", serializeScoreRows(), getToken));
  }
};
