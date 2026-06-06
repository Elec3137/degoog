import { Database } from "bun:sqlite";
import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { randomBytes } from "crypto";
import type { ExportRow } from "../types/adapter";
import { getAdapter } from "../db/factory";
import { EXPORT_SELECT_SQL } from "../shared/export-select";
import { logger } from "../../utils/logger";

const BATCH_SIZE = 500;

const readExportRows = (db: Database, type: string): ExportRow[] => {
  try {
    const rows = db.prepare(EXPORT_SELECT_SQL).all() as ExportRow[];
    logger.info("indexer", `importer: read ${rows.length} rows from source db for type=${type}`);
    return rows;
  } catch (err) {
    logger.warn("indexer", "importer: failed to read rows from uploaded db", err);
    return [];
  }
};

export const importFromBuffer = async (
  fileBuffer: ArrayBuffer,
  type: string,
): Promise<{ urls: number; hits: number }> => {
  const tmpPath = join(tmpdir(), `degoog-import-${randomBytes(8).toString("hex")}.db`);
  try {
    writeFileSync(tmpPath, Buffer.from(fileBuffer));
    const sourceDb = new Database(tmpPath, { readonly: true });
    let rows: ExportRow[];
    try {
      rows = readExportRows(sourceDb, type);
    } finally {
      sourceDb.close();
    }

    if (rows.length === 0) return { urls: 0, hits: 0 };

    const adapter = getAdapter();
    let totalUrls = 0;
    let totalHits = 0;

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const result = await adapter.importRows(type, batch);
      totalUrls += result.urls;
      totalHits += result.hits;
    }

    logger.info("indexer", `import complete type=${type} urls=${totalUrls} hits=${totalHits}`);
    return { urls: totalUrls, hits: totalHits };
  } finally {
    try {
      unlinkSync(tmpPath);
    } catch {
      // best-effort cleanup
    }
  }
};
