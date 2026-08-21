import { mkdirSync, readdirSync, readFileSync, renameSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import type { AggregateEvent, SaleEvent } from "@retail-pilot/schemas";
import { DEFAULT_DB, insertAggregate, insertSale, openDb } from "./db.js";

export function syncInbox(options: {
  dbPath?: string;
  aggregatesDir?: string;
  salesDir?: string;
  aggregatesArchiveDir?: string;
  salesArchiveDir?: string;
  archive?: boolean;
}): { aggregates: number; sales: number } {
  const dbPath = options.dbPath ?? DEFAULT_DB;
  const aggregatesDir = resolve(
    options.aggregatesDir ?? "data/aggregates/outbox",
  );
  const salesDir = resolve(options.salesDir ?? "data/pos/inbox");
  const archive = options.archive ?? true;
  const aggregatesArchiveDir = resolve(
    options.aggregatesArchiveDir ?? join(aggregatesDir, "..", "archive"),
  );
  const salesArchiveDir = resolve(
    options.salesArchiveDir ?? join(salesDir, "..", "archive"),
  );
  const db = openDb(dbPath);

  let aggregates = 0;
  let sales = 0;

  for (const file of listJson(aggregatesDir)) {
    const event = JSON.parse(readFileSync(file, "utf8")) as AggregateEvent;
    insertAggregate(db, event);
    aggregates++;
    if (archive) archiveFile(file, aggregatesArchiveDir);
  }
  for (const file of listJson(salesDir)) {
    const event = JSON.parse(readFileSync(file, "utf8")) as SaleEvent;
    insertSale(db, event);
    sales++;
    if (archive) archiveFile(file, salesArchiveDir);
  }

  return { aggregates, sales };
}

function listJson(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => resolve(dir, f));
  } catch {
    return [];
  }
}

function archiveFile(file: string, archiveDir: string): void {
  mkdirSync(archiveDir, { recursive: true });
  renameSync(file, join(archiveDir, basename(file)));
}
