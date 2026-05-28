import { getBase } from "../utils/base-url";

const t = window.scopedT("core");

interface IndexerStats {
  totalResults: number;
  totalQueries: number;
  byType: Record<string, number>;
  dbSizeBytes: number;
}

const tr = (key: string, vars?: Record<string, string>): string =>
  t(`settings-page.indexer.${key}`, vars);

const trPub = (key: string, vars?: Record<string, string>): string =>
  t(`settings-page.indexer-public.${key}`, vars);

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

export const initIndexerPublic = async (): Promise<void> => {
  const section = document.getElementById("indexer-public-section");
  if (!section) return;

  let stats: IndexerStats | null = null;
  try {
    const res = await fetch(`${getBase()}/api/indexer/stats`);
    if (res.ok) stats = (await res.json()) as IndexerStats;
  } catch {
    stats = null;
  }
  if (!stats) {
    section.hidden = true;
    return;
  }

  section.hidden = false;

  const statsWrap = document.getElementById("indexer-public-stats");
  if (statsWrap) {
    statsWrap.innerHTML = `
      <div><dt>${tr("total-results")}</dt><dd>${stats.totalResults}</dd></div>
      <div><dt>${tr("total-queries")}</dt><dd>${stats.totalQueries}</dd></div>
      <div><dt>${tr("db-size")}</dt><dd>${formatBytes(stats.dbSizeBytes)}</dd></div>
    `;
  }

  document
    .getElementById("indexer-public-export-btn")
    ?.addEventListener("click", () => {
      window.location.href = `${getBase()}/api/indexer/export`;
    });

  const pushBtn = document.getElementById(
    "indexer-public-push-btn",
  ) as HTMLButtonElement | null;
  const targetInput = document.getElementById(
    "indexer-public-target-url",
  ) as HTMLInputElement | null;
  const status = document.getElementById("indexer-public-push-status");
  pushBtn?.addEventListener("click", async () => {
    if (!targetInput || !status) return;
    const targetUrl = targetInput.value.trim();
    if (!targetUrl) return;
    pushBtn.disabled = true;
    status.textContent = "...";
    try {
      const res = await fetch(`${getBase()}/api/indexer/push`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUrl }),
      });
      const data = (await res.json()) as {
        inserted?: number;
        updated?: number;
        skipped?: number;
        error?: string;
      };
      if (!res.ok) {
        status.textContent = data.error ?? `Push failed (${res.status})`;
      } else {
        status.textContent = trPub("push-success", {
          inserted: String(data.inserted ?? 0),
          updated: String(data.updated ?? 0),
          skipped: String(data.skipped ?? 0),
        });
      }
    } catch {
      status.textContent = trPub("push-error");
    } finally {
      pushBtn.disabled = false;
    }
  });
};
