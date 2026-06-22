import type { EngineTiming } from "../../types";
import { escapeAttribute } from "../../utils/dom";

const t = window.scopedT("themes/degoog");

export const engineFailureText = (et: EngineTiming): string => {
  if (!et.status || et.status === "ok") return "";
  const key = `search-templates.sidebar.failure-reasons.${et.status}`;
  const mapped = t(key);
  const base =
    mapped === key
      ? t("search-templates.sidebar.failure-reasons.unknown")
      : mapped;
  return et.httpStatus ? `${base} (${et.httpStatus})` : base;
};

export const engineCountHtml = (et: EngineTiming, label: string): string => {
  const reason = engineFailureText(et);
  if (!reason) return label;
  return `<span class="engine-stat-reason" data-tooltip="${escapeAttribute(reason)}" tabindex="0">${label}</span>`;
};
