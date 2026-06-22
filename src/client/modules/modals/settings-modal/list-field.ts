import { escapeHtml } from "../../../utils/dom";
import { renderMdInline } from "../../../utils/md";
import {
  isListToggle,
  isListDisplay,
  defaultListRow,
  parseListValue,
  serializeRows,
  rowSummary,
  type ListRow,
} from "./list-field-data";
import type { SettingField, ExtensionMeta } from "../../../types";

const t = window.scopedT("core");

const _renderToggle = (sub: SettingField, value: string): string => {
  const checked = value === "true" ? " checked" : "";
  return `<label class="ext-list-sub ext-list-sub--toggle">
      <span class="ext-list-sub-label">${escapeHtml(sub.label)}</span>
      <div class="engine-toggle degoog-toggle-wrap degoog-toggle-wrap--transparent">
        <input type="checkbox" class="ext-list-subfield" data-subkey="${escapeHtml(sub.key)}" data-subtype="toggle"${checked}>
        <span class="toggle-slider degoog-toggle"></span>
      </div>
    </label>`;
};

const _renderInfo = (sub: SettingField): string => {
  const desc = sub.description
    ? `<span class="ext-field-desc">${renderMdInline(sub.description)}</span>`
    : "";
  const hasValue = sub.default != null && sub.default !== "";
  const valueHtml = hasValue
    ? `<input class="ext-field-input degoog-input" type="text" value="${escapeHtml(sub.default ?? "")}" disabled>`
    : "";
  return `<label class="ext-list-sub">
      <span class="ext-list-sub-label">${escapeHtml(sub.label)}</span>
      ${valueHtml}
      ${desc}
    </label>`;
};

const _renderTextarea = (sub: SettingField, value: string): string => {
  return `<label class="ext-list-sub">
      <span class="ext-list-sub-label">${escapeHtml(sub.label)}</span>
      <textarea class="ext-field-input ext-list-subfield degoog-input" data-subkey="${escapeHtml(sub.key)}" data-subtype="text" rows="2" placeholder="${escapeHtml(sub.placeholder || "")}" autocomplete="off">${escapeHtml(value)}</textarea>
    </label>`;
};

const _renderSelect = (sub: SettingField, value: string): string => {
  const options = sub.options ?? [];
  const selected = options.includes(value) ? value : (options[0] ?? "");
  const opts = options
    .map((opt, i) => {
      const optLabel = sub.optionLabels?.[i] ?? opt;
      return `<option value="${escapeHtml(opt)}"${opt === selected ? " selected" : ""}>${escapeHtml(optLabel)}</option>`;
    })
    .join("");
  return `<label class="ext-list-sub">
      <span class="ext-list-sub-label">${escapeHtml(sub.label)}</span>
      <div class="ext-field-select-wrap degoog-select-wrap">
        <select class="ext-field-input ext-list-subfield ext-field-select degoog-input" data-subkey="${escapeHtml(sub.key)}" data-subtype="text">${opts}</select>
      </div>
    </label>`;
};

const _inputTypeFor = (type: SettingField["type"]): string => {
  if (type === "url") return "url";
  if (type === "number") return "number";
  if (type === "password") return "password";
  return "text";
};

const _renderInput = (sub: SettingField, value: string): string => {
  const inputType = _inputTypeFor(sub.type);
  return `<label class="ext-list-sub">
      <span class="ext-list-sub-label">${escapeHtml(sub.label)}</span>
      <input class="ext-field-input ext-list-subfield degoog-input" type="${inputType}" data-subkey="${escapeHtml(sub.key)}" data-subtype="text" value="${escapeHtml(value)}" placeholder="${escapeHtml(sub.placeholder || "")}" autocomplete="off">
    </label>`;
};

const _renderSubField = (sub: SettingField, row: ListRow): string => {
  const value = row[sub.key] ?? "";
  if (isListToggle(sub)) return _renderToggle(sub, value);
  if (isListDisplay(sub)) return _renderInfo(sub);
  if (sub.type === "textarea") return _renderTextarea(sub, value);
  if (sub.type === "select") return _renderSelect(sub, value);
  return _renderInput(sub, value);
};

const _renderRow = (row: ListRow, itemSchema: SettingField[]): string => {
  const editor = itemSchema
    .map((sub) => _renderSubField(sub, row))
    .join("");
  return `<div class="ext-list-row">
      <div class="ext-list-row-head">
        <span class="ext-list-row-summary">${escapeHtml(rowSummary(row, itemSchema))}</span>
        <button type="button" class="ext-list-row-edit" aria-label="${escapeHtml(t("settings-page.modal.field-edit-aria"))}">✎</button>
        <button type="button" class="ext-list-row-remove" aria-label="${escapeHtml(t("settings-page.modal.field-remove-aria"))}">×</button>
      </div>
      <div class="ext-list-row-editor" hidden>${editor}</div>
    </div>`;
};

export const renderListField = (
  field: SettingField,
  ext: ExtensionMeta,
): string => {
  const itemSchema = field.itemSchema ?? [];
  const rows = parseListValue(ext.settings[field.key], itemSchema);
  const descHtml = field.description
    ? `<p class="ext-field-desc">${renderMdInline(field.description)}</p>`
    : "";
  const addLabel = escapeHtml(field.addLabel || t("settings-page.modal.field-add"));
  const schemaAttr = encodeURIComponent(JSON.stringify(itemSchema));
  const rowsHtml = rows.map((row) => _renderRow(row, itemSchema)).join("");
  return `<div class="ext-field" data-key="${escapeHtml(field.key)}" data-type="list" data-item-schema="${schemaAttr}">
      <label class="ext-field-label">${escapeHtml(field.label)}</label>
      <div class="ext-list">
        <div class="ext-list-rows">${rowsHtml}</div>
        <button type="button" class="ext-list-add btn btn--secondary degoog-btn degoog-btn--secondary">${addLabel}</button>
      </div>
      <input type="hidden" id="field-${escapeHtml(field.key)}" class="ext-field-list-value">
      ${descHtml}
    </div>`;
};

const _readSchema = (fieldEl: HTMLElement): SettingField[] => {
  try {
    const raw = fieldEl.dataset.itemSchema || "";
    const parsed = JSON.parse(raw ? decodeURIComponent(raw) : "[]") as unknown;
    return Array.isArray(parsed) ? (parsed as SettingField[]) : [];
  } catch {
    return [];
  }
};

const _collectRow = (
  rowEl: HTMLElement,
  itemSchema: SettingField[],
): ListRow => {
  const row: ListRow = {};
  rowEl
    .querySelectorAll<HTMLElement>(".ext-list-subfield")
    .forEach((input) => {
      const key = input.dataset.subkey;
      if (!key) return;
      if (input.dataset.subtype === "toggle") {
        row[key] = (input as HTMLInputElement).checked ? "true" : "false";
      } else {
        row[key] = (input as HTMLInputElement | HTMLTextAreaElement).value.trim();
      }
    });
  for (const sub of itemSchema) {
    if (!(sub.key in row)) row[sub.key] = "";
  }
  return row;
};

export const initListFields = (container: HTMLElement): void => {
  container
    .querySelectorAll<HTMLElement>(".ext-field[data-type='list']")
    .forEach((fieldEl) => _initOne(fieldEl));
};

const _initOne = (fieldEl: HTMLElement): void => {
  const itemSchema = _readSchema(fieldEl);
  const rowsEl = fieldEl.querySelector<HTMLElement>(".ext-list-rows");
  const addBtn = fieldEl.querySelector<HTMLElement>(".ext-list-add");
  const hidden = fieldEl.querySelector<HTMLInputElement>(
    ".ext-field-list-value",
  );
  if (!rowsEl || !addBtn || !hidden) return;

  const sync = (): void => {
    const rows = [
      ...rowsEl.querySelectorAll<HTMLElement>(".ext-list-row"),
    ].map((rowEl) => _collectRow(rowEl, itemSchema));
    hidden.value = serializeRows(rows, itemSchema);
  };

  const updateSummary = (rowEl: HTMLElement): void => {
    const summary = rowEl.querySelector<HTMLElement>(".ext-list-row-summary");
    if (summary) {
      summary.textContent = rowSummary(_collectRow(rowEl, itemSchema), itemSchema) || "…";
    }
  };

  const bindRow = (rowEl: HTMLElement): void => {
    const editor = rowEl.querySelector<HTMLElement>(".ext-list-row-editor");
    rowEl
      .querySelector(".ext-list-row-edit")
      ?.addEventListener("click", () => {
        if (editor) editor.hidden = !editor.hidden;
      });
    rowEl
      .querySelector(".ext-list-row-remove")
      ?.addEventListener("click", () => {
        rowEl.remove();
        sync();
      });
    rowEl.querySelectorAll<HTMLElement>(".ext-list-subfield").forEach((input) => {
      const handler = (): void => {
        updateSummary(rowEl);
        sync();
      };
      input.addEventListener("input", handler);
      input.addEventListener("change", handler);
    });
  };

  rowsEl
    .querySelectorAll<HTMLElement>(".ext-list-row")
    .forEach((rowEl) => bindRow(rowEl));

  addBtn.addEventListener("click", () => {
    const wrap = document.createElement("div");
    wrap.innerHTML = _renderRow(defaultListRow(itemSchema), itemSchema);
    const rowEl = wrap.firstElementChild as HTMLElement | null;
    if (!rowEl) return;
    const editor = rowEl.querySelector<HTMLElement>(".ext-list-row-editor");
    if (editor) editor.hidden = false;
    rowsEl.appendChild(rowEl);
    bindRow(rowEl);
    sync();
    rowEl.querySelector<HTMLElement>(".ext-list-subfield")?.focus();
  });

  sync();
};
