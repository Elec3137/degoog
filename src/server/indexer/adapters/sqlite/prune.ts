import type { Database } from "bun:sqlite";
import type { IndexerConfig } from "../../types/config";

export const pruneOrphans = (db: Database): void => {
  db.exec("DELETE FROM urls WHERE id NOT IN (SELECT url_id FROM query_hits)");
};

export const runSqlitePrune = (db: Database, cfg: IndexerConfig): void => {
  if (cfg.maxAgeDays > 0) {
    const cutoff = Date.now() - cfg.maxAgeDays * 86_400_000;
    db.prepare("DELETE FROM query_hits WHERE last_seen < ?").run(cutoff);
    pruneOrphans(db);
  }
  if (!cfg.pruneEnabled) return;
  if (cfg.maxHits > 0) {
    const row = db.prepare("SELECT COUNT(*) AS c FROM query_hits").get() as { c: number };
    const excess = row.c - cfg.maxHits;
    if (excess > 0) {
      db.prepare(
        `DELETE FROM query_hits WHERE id IN (
          SELECT id FROM query_hits ORDER BY last_seen ASC LIMIT ?
        )`,
      ).run(excess);
      pruneOrphans(db);
    }
  }
  if (cfg.maxUrls > 0) {
    const row = db.prepare("SELECT COUNT(*) AS c FROM urls").get() as { c: number };
    const excess = row.c - cfg.maxUrls;
    if (excess > 0) {
      db.prepare(
        `DELETE FROM urls WHERE id IN (
          SELECT id FROM urls ORDER BY last_seen ASC LIMIT ?
        )`,
      ).run(excess);
    }
  }
};
