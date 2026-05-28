import { getBase } from "../utils/base-url";

const t = window.scopedT("core");
const TOKEN_KEY = "degoog-settings-token";

interface IndexerStats {
  totalResults: number;
  totalQueries: number;
  byType: Record<string, number>;
  dbSizeBytes: number;
}

interface PushReport {
  ok: boolean;
  target: string;
  inserted: number;
  updated: number;
  skipped: number;
  total: number;
}

const getToken = (): string | null => sessionStorage.getItem(TOKEN_KEY);

const authHeaders = (extra: Record<string, string> = {}): Record<string, string> => {
  const token = getToken();
  const headers: Record<string, string> = { ...extra };
  if (token) headers["x-settings-token"] = token;
  return headers;
};

const tr = (key: string, vars?: Record<string, string>): string =>
  t(`settings-page.indexer.${key}`, vars);

export const setIndexerNavVisible = (visible: boolean): void => {
  document.querySelectorAll<HTMLElement>("[data-indexer-nav]").forEach((el) => {
    el.style.display = visible ? "" : "none";
  });
  const select = document.getElementById("settings-tab-select");
  let opt = document.getElementById(
    "settings-tab-indexer-option",
  ) as HTMLOptionElement | null;
  if (visible && select && !opt) {
    opt = document.createElement("option");
    opt.id = "settings-tab-indexer-option";
    opt.value = "indexer";
    opt.textContent = t("settings-page.nav.indexer");
    select.appendChild(opt);
  } else if (!visible && opt) {
    opt.remove();
  }
};

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const renderShell = (container: HTMLElement): void => {
  container.innerHTML = `
    <section
      class="settings-section ext-card degoog-panel degoog-panel--ext-card"
      id="indexer-tab-section"
    >
      <div class="setting-section-heading-wrapper">
        <h2 class="settings-section-heading">${tr("heading")}</h2>
        <div class="floating-section-icon">
          <i class="fa-solid fa-database"></i>
        </div>
      </div>
      <p class="settings-desc">${tr("desc")}</p>

      <p id="indexer-disabled-note" class="settings-desc degoog-indexer-disabled-note" hidden>
        ${tr("disabled")}
      </p>

      <fieldset class="settings-fieldset">
        <fieldset
          class="settings-fieldset settings-fieldset-inverse settings-fieldset--compact"
          id="indexer-public-wrap"
        >
          <label class="settings-toggle-wrap degoog-toggle-wrap">
            <input type="checkbox" id="indexer-public-export" class="settings-toggle" />
            <span class="toggle-slider degoog-toggle"></span>
            <span class="settings-toggle-label">${tr("public-export")}</span>
          </label>
          <p class="settings-desc">${tr("public-export-desc")}</p>
        </fieldset>

        <fieldset
          class="settings-fieldset settings-fieldset-inverse settings-fieldset--compact"
          id="indexer-incoming-wrap"
        >
          <label class="settings-toggle-wrap degoog-toggle-wrap">
            <input type="checkbox" id="indexer-accept-incoming" class="settings-toggle" />
            <span class="toggle-slider degoog-toggle"></span>
            <span class="settings-toggle-label">${tr("accept-incoming")}</span>
          </label>
          <p class="settings-desc">${tr("accept-incoming-desc")}</p>
        </fieldset>

        <div id="indexer-stats-wrap" class="degoog-indexer-stats" hidden>
          <p class="settings-rate-limit-defaults">${tr("stats-heading")}</p>
          <dl class="degoog-stat-grid">
            <div><dt>${tr("total-results")}</dt><dd id="indexer-stat-total">0</dd></div>
            <div><dt>${tr("total-queries")}</dt><dd id="indexer-stat-queries">0</dd></div>
            <div><dt>${tr("db-size")}</dt><dd id="indexer-stat-size">0 B</dd></div>
          </dl>
          <div id="indexer-by-type" class="degoog-stat-grid degoog-stat-grid--types"></div>

          <fieldset
            class="settings-fieldset settings-fieldset-inverse settings-fieldset--compact"
          >
            <label class="settings-proxy-urls-label" for="indexer-push-url">${tr("push-label")}</label>
            <div class="degoog-action-row">
              <input
                type="url"
                id="indexer-push-url"
                class="degoog-input"
                placeholder="${tr("push-placeholder")}"
              />
              <button
                type="button"
                class="btn btn--secondary degoog-btn degoog-btn--secondary"
                id="indexer-push-btn"
              >
                ${tr("push-btn")}
              </button>
            </div>
            <p class="settings-desc">${tr("push-desc")}</p>
            <p id="indexer-push-status" class="settings-desc"></p>
          </fieldset>

          <div class="degoog-action-row degoog-action-row--buttons">
            <button
              type="button"
              class="btn btn--secondary degoog-btn degoog-btn--secondary"
              id="indexer-export-btn"
            >
              ${tr("export-btn")}
            </button>
            <button
              type="button"
              class="btn btn--secondary degoog-btn degoog-btn--secondary"
              id="indexer-clear-btn"
            >
              ${tr("clear-btn")}
            </button>
          </div>
        </div>
      </fieldset>
    </section>
  `;
};

const fetchStats = async (): Promise<IndexerStats | null> => {
  try {
    const res = await fetch(`${getBase()}/api/indexer/stats`, {
      headers: authHeaders(),
    });
    if (!res.ok) return null;
    return (await res.json()) as IndexerStats;
  } catch {
    return null;
  }
};

const renderStats = (stats: IndexerStats): void => {
  const totalEl = document.getElementById("indexer-stat-total");
  const queriesEl = document.getElementById("indexer-stat-queries");
  const sizeEl = document.getElementById("indexer-stat-size");
  if (totalEl) totalEl.textContent = String(stats.totalResults);
  if (queriesEl) queriesEl.textContent = String(stats.totalQueries);
  if (sizeEl) sizeEl.textContent = formatBytes(stats.dbSizeBytes);

  const byTypeEl = document.getElementById("indexer-by-type");
  if (byTypeEl) {
    const entries = Object.entries(stats.byType);
    byTypeEl.innerHTML =
      entries.length === 0
        ? ""
        : entries
          .map(
            ([type, count]) =>
              `<div><dt>${type}</dt><dd>${count}</dd></div>`,
          )
          .join("");
  }
};

const persistToggles = async (
  publicExport: boolean,
  acceptIncoming: boolean,
): Promise<void> => {
  await fetch(`${getBase()}/api/settings/general`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      degoogIndexerPublicExport: String(publicExport),
      degoogIndexerAcceptIncoming: String(acceptIncoming),
    }),
  });
};

const openClearModal = (onCleared: () => void): void => {
  const overlay = document.getElementById("ext-modal-overlay");
  const titleEl = document.getElementById("ext-modal-title");
  const bodyEl = document.getElementById("ext-modal-body");
  const statusEl = document.getElementById("ext-modal-status");
  const saveEl = document.getElementById("ext-modal-save") as HTMLButtonElement | null;
  const closeBtn = document.getElementById("ext-modal-close");
  if (!overlay || !titleEl || !bodyEl || !statusEl || !saveEl) return;

  titleEl.textContent = tr("clear-modal-title");
  bodyEl.innerHTML = `
    <p>${tr("clear-modal-desc")}</p>
    <input type="text" id="indexer-clear-confirm" class="degoog-input" autocomplete="off" />`;
  statusEl.textContent = "";
  saveEl.textContent = tr("clear-confirm");
  saveEl.disabled = false;
  overlay.style.display = "";

  const close = (): void => {
    overlay.style.display = "none";
    statusEl.textContent = "";
    bodyEl.innerHTML = "";
  };
  closeBtn?.addEventListener("click", close, { once: true });

  saveEl.addEventListener("click", async () => {
    const input = bodyEl.querySelector<HTMLInputElement>("#indexer-clear-confirm");
    if (input?.value.trim() !== "CLEAR") {
      statusEl.textContent = tr("clear-modal-desc");
      return;
    }
    saveEl.disabled = true;
    try {
      const res = await fetch(`${getBase()}/api/indexer/clear`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ confirm: true }),
      });
      if (!res.ok) {
        statusEl.textContent = "Failed";
        saveEl.disabled = false;
        return;
      }
      close();
      onCleared();
    } catch {
      statusEl.textContent = "Failed";
      saveEl.disabled = false;
    }
  });
};

const wireToggles = async (
  refreshStats: () => Promise<void>,
): Promise<(isEnabled: boolean) => void> => {
  const res = await fetch(`${getBase()}/api/settings/general`, {
    headers: authHeaders(),
  });
  const settings = res.ok ? ((await res.json()) as Record<string, unknown>) : {};
  const enabled = settings.degoogIndexerEnabled === true || settings.degoogIndexerEnabled === "true";
  const publicExport =
    settings.degoogIndexerPublicExport === true ||
    settings.degoogIndexerPublicExport === "true";
  const acceptIncoming =
    settings.degoogIndexerAcceptIncoming === true ||
    settings.degoogIndexerAcceptIncoming === "true";

  const publicEl = document.getElementById("indexer-public-export") as HTMLInputElement | null;
  const incomingEl = document.getElementById("indexer-accept-incoming") as HTMLInputElement | null;
  const publicWrap = document.getElementById("indexer-public-wrap");
  const incomingWrap = document.getElementById("indexer-incoming-wrap");
  const statsWrap = document.getElementById("indexer-stats-wrap");
  const disabledNote = document.getElementById("indexer-disabled-note");

  const applyVisibility = (isEnabled: boolean): void => {
    setIndexerNavVisible(isEnabled);
    if (statsWrap) statsWrap.hidden = !isEnabled;
    if (disabledNote) disabledNote.hidden = isEnabled;
    for (const wrap of [publicWrap, incomingWrap]) {
      wrap?.classList.toggle("degoog-fieldset--disabled", !isEnabled);
    }
    if (publicEl) publicEl.disabled = !isEnabled;
    if (incomingEl) incomingEl.disabled = !isEnabled;
  };

  if (publicEl) publicEl.checked = publicExport;
  if (incomingEl) incomingEl.checked = acceptIncoming;
  applyVisibility(enabled);
  if (enabled) await refreshStats();

  const saveAll = async (): Promise<void> => {
    await persistToggles(
      publicEl?.checked ?? false,
      incomingEl?.checked ?? false,
    );
  };

  publicEl?.addEventListener("change", saveAll);
  incomingEl?.addEventListener("change", saveAll);

  return applyVisibility;
};

const wirePush = (refreshStats: () => Promise<void>): void => {
  const btn = document.getElementById("indexer-push-btn") as HTMLButtonElement | null;
  const input = document.getElementById("indexer-push-url") as HTMLInputElement | null;
  const status = document.getElementById("indexer-push-status");
  if (!btn || !input || !status) return;

  btn.addEventListener("click", async () => {
    const targetUrl = input.value.trim();
    if (!targetUrl) return;
    btn.disabled = true;
    status.textContent = "...";
    try {
      const res = await fetch(`${getBase()}/api/indexer/push`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ targetUrl }),
      });
      const data = (await res.json()) as PushReport & { error?: string };
      if (!res.ok) {
        status.textContent = data.error ?? `Push failed (${res.status})`;
      } else {
        status.textContent = tr("push-success", {
          inserted: String(data.inserted),
          updated: String(data.updated),
          skipped: String(data.skipped),
        });
        await refreshStats();
      }
    } catch {
      status.textContent = tr("push-error");
    } finally {
      btn.disabled = false;
    }
  });
};

export const initIndexerTab = async (container: HTMLElement): Promise<void> => {
  renderShell(container);

  const refreshStats = async (): Promise<void> => {
    const stats = await fetchStats();
    if (stats) renderStats(stats);
  };

  const applyVisibility = await wireToggles(refreshStats);
  wirePush(refreshStats);

  const masterEl = document.getElementById(
    "settings-degoog-indexer-enabled",
  ) as HTMLInputElement | null;
  masterEl?.addEventListener("change", () => {
    applyVisibility(masterEl.checked);
    if (masterEl.checked) void refreshStats();
  });

  document
    .getElementById("indexer-export-btn")
    ?.addEventListener("click", () => {
      const token = getToken();
      const q = token ? `?token=${encodeURIComponent(token)}` : "";
      window.location.href = `${getBase()}/api/indexer/export${q}`;
    });

  document
    .getElementById("indexer-clear-btn")
    ?.addEventListener("click", () => openClearModal(refreshStats));
};
