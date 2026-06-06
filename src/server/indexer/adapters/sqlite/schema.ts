import { EXPORT_SCHEMA_DDL } from "../../export/schema";

const FTS_DDL = [
  `CREATE VIRTUAL TABLE IF NOT EXISTS urls_fts USING fts5(
    title, snippet, url,
    content='urls', content_rowid='id'
  )`,
  `CREATE TRIGGER IF NOT EXISTS urls_ai AFTER INSERT ON urls BEGIN
    INSERT INTO urls_fts(rowid, title, snippet, url)
    VALUES (new.id, new.title, new.snippet, new.url);
  END`,
  `CREATE TRIGGER IF NOT EXISTS urls_ad AFTER DELETE ON urls BEGIN
    INSERT INTO urls_fts(urls_fts, rowid, title, snippet, url)
    VALUES('delete', old.id, old.title, old.snippet, old.url);
  END`,
  `CREATE TRIGGER IF NOT EXISTS urls_au AFTER UPDATE ON urls BEGIN
    INSERT INTO urls_fts(urls_fts, rowid, title, snippet, url)
    VALUES('delete', old.id, old.title, old.snippet, old.url);
    INSERT INTO urls_fts(rowid, title, snippet, url)
    VALUES (new.id, new.title, new.snippet, new.url);
  END`,
];

export const SQLITE_SCHEMA_DDL = [...EXPORT_SCHEMA_DDL, ...FTS_DDL];
