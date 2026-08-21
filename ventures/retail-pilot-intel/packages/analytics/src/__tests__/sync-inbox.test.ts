import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDb } from "../db.js";
import { syncInbox } from "../sync-inbox.js";
import { aggregateEvent, saleEvent } from "./test-db.js";

function withInboxDirs<T>(
  fn: (dirs: { dbPath: string; aggregatesDir: string; salesDir: string }) => T,
): T {
  const root = mkdtempSync(join(tmpdir(), "sync-inbox-test-"));
  const aggregatesDir = join(root, "aggregates");
  const salesDir = join(root, "sales");
  mkdirSync(aggregatesDir, { recursive: true });
  mkdirSync(salesDir, { recursive: true });
  try {
    return fn({ dbPath: join(root, "pilot.db"), aggregatesDir, salesDir });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("syncInbox reads aggregate and sale JSON files and inserts them", () => {
  withInboxDirs(({ dbPath, aggregatesDir, salesDir }) => {
    writeFileSync(join(aggregatesDir, "a1.json"), JSON.stringify(aggregateEvent({ event_id: "a1" })));
    writeFileSync(join(aggregatesDir, "a2.json"), JSON.stringify(aggregateEvent({ event_id: "a2" })));
    writeFileSync(join(salesDir, "s1.json"), JSON.stringify(saleEvent({ event_id: "s1" })));

    const result = syncInbox({ dbPath, aggregatesDir, salesDir });
    assert.deepEqual(result, { aggregates: 2, sales: 1 });

    const db = openDb(dbPath);
    const aggCount = db.prepare("SELECT COUNT(*) AS c FROM aggregate_events").get() as { c: number };
    const saleCount = db.prepare("SELECT COUNT(*) AS c FROM sale_events").get() as { c: number };
    assert.equal(aggCount.c, 2);
    assert.equal(saleCount.c, 1);
  });
});

test("syncInbox ignores non-.json files in the inbox directories", () => {
  withInboxDirs(({ dbPath, aggregatesDir, salesDir }) => {
    writeFileSync(join(aggregatesDir, "a1.json"), JSON.stringify(aggregateEvent({ event_id: "a1" })));
    writeFileSync(join(aggregatesDir, "README.md"), "not json");
    writeFileSync(join(salesDir, ".DS_Store"), "junk");

    const result = syncInbox({ dbPath, aggregatesDir, salesDir });
    assert.deepEqual(result, { aggregates: 1, sales: 0 });
  });
});

test("syncInbox archives processed files out of the inbox dirs by default", () => {
  withInboxDirs(({ dbPath, aggregatesDir, salesDir }) => {
    writeFileSync(join(aggregatesDir, "a1.json"), JSON.stringify(aggregateEvent({ event_id: "a1" })));
    writeFileSync(join(salesDir, "s1.json"), JSON.stringify(saleEvent({ event_id: "s1" })));

    syncInbox({ dbPath, aggregatesDir, salesDir });

    assert.deepEqual(readdirSync(aggregatesDir), []);
    assert.deepEqual(readdirSync(salesDir), []);
    assert.ok(existsSync(join(aggregatesDir, "..", "archive", "a1.json")));
    assert.ok(existsSync(join(salesDir, "..", "archive", "s1.json")));
  });
});

test("syncInbox re-run after archiving does not re-count already-processed files", () => {
  withInboxDirs(({ dbPath, aggregatesDir, salesDir }) => {
    writeFileSync(join(aggregatesDir, "a1.json"), JSON.stringify(aggregateEvent({ event_id: "a1" })));

    const first = syncInbox({ dbPath, aggregatesDir, salesDir });
    assert.deepEqual(first, { aggregates: 1, sales: 0 });

    const second = syncInbox({ dbPath, aggregatesDir, salesDir });
    assert.deepEqual(second, { aggregates: 0, sales: 0 });
  });
});

test("syncInbox leaves files in place when archive is disabled", () => {
  withInboxDirs(({ dbPath, aggregatesDir, salesDir }) => {
    writeFileSync(join(aggregatesDir, "a1.json"), JSON.stringify(aggregateEvent({ event_id: "a1" })));

    syncInbox({ dbPath, aggregatesDir, salesDir, archive: false });

    assert.deepEqual(readdirSync(aggregatesDir), ["a1.json"]);
  });
});

test("syncInbox returns zero counts (not throw) when inbox directories don't exist", () => {
  const root = mkdtempSync(join(tmpdir(), "sync-inbox-missing-"));
  try {
    const result = syncInbox({
      dbPath: join(root, "pilot.db"),
      aggregatesDir: join(root, "does-not-exist-aggregates"),
      salesDir: join(root, "does-not-exist-sales"),
    });
    assert.deepEqual(result, { aggregates: 0, sales: 0 });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
