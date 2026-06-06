import type postgres from "postgres";
import type { IndexerConfig } from "../../types/config";

export const runPgPrune = async (
  sql: ReturnType<typeof postgres>,
  schema: string,
  cfg: IndexerConfig,
): Promise<void> => {
  await sql.begin(async (tx) => {
    if (cfg.maxAgeDays > 0) {
      const cutoff = Date.now() - cfg.maxAgeDays * 86_400_000;
      await tx`DELETE FROM ${tx(schema)}.query_hits WHERE last_seen < ${cutoff}`;
      await tx`
        DELETE FROM ${tx(schema)}.urls
        WHERE id NOT IN (SELECT url_id FROM ${tx(schema)}.query_hits)
      `;
    }
    if (!cfg.pruneEnabled) return;
    if (cfg.maxHits > 0) {
      await tx`
        DELETE FROM ${tx(schema)}.query_hits
        WHERE id IN (
          SELECT id FROM ${tx(schema)}.query_hits
          ORDER BY last_seen ASC
          LIMIT GREATEST(0, (SELECT COUNT(*) FROM ${tx(schema)}.query_hits) - ${cfg.maxHits})
        )
      `;
      await tx`
        DELETE FROM ${tx(schema)}.urls
        WHERE id NOT IN (SELECT url_id FROM ${tx(schema)}.query_hits)
      `;
    }
    if (cfg.maxUrls > 0) {
      await tx`
        DELETE FROM ${tx(schema)}.urls
        WHERE id IN (
          SELECT id FROM ${tx(schema)}.urls
          ORDER BY last_seen ASC
          LIMIT GREATEST(0, (SELECT COUNT(*) FROM ${tx(schema)}.urls) - ${cfg.maxUrls})
        )
      `;
    }
  });
};
