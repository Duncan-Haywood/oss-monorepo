/**
 * End-to-end tests over the REAL ingest pipeline.
 *
 * The unit tests in db-and-report.test.ts hand-insert rows, so they can prove
 * things about inputs the shipped pipeline is incapable of producing. These
 * tests instead run the actual CLIs that `scripts/bootstrap.ts` runs, in a
 * throwaway working directory, and assert on what that pipeline really yields.
 * Nothing here is mocked or stubbed: every assertion is against the real
 * modules and the real child processes.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { openDb } from "../src/db.js";
import { dailySummary } from "../src/report.js";

const REPO_ROOT = resolve(import.meta.dirname, "../../..");
const EDGE_CLI = join(REPO_ROOT, "packages/edge/src/cli.ts");
const POS_CLI = join(REPO_ROOT, "packages/pos/src/cli.ts");
const ANALYTICS_CLI = join(REPO_ROOT, "packages/analytics/src/cli.ts");
const TSX = import.meta.resolve("tsx");

function runCli(
  cli: string,
  args: string[],
  cwd: string,
): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, ["--import", TSX, cli, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: "" },
  });
}

function withTempStore<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "retail-pilot-pipeline-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function todayIsoUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function readOnlyJson(dir: string): Record<string, unknown> {
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  assert.equal(files.length, 1, `expected exactly one JSON file in ${dir}`);
  return JSON.parse(readFileSync(join(dir, files[0]!), "utf8")) as Record<
    string,
    unknown
  >;
}

test("the real pipeline reports conversion as not measurable, never 100%", () => {
  withTempStore((dir) => {
    // Exactly the sequence scripts/bootstrap.ts runs.
    const init = runCli(ANALYTICS_CLI, ["init"], dir);
    assert.equal(init.status, 0, init.stderr);
    const edge = runCli(EDGE_CLI, ["--sample"], dir);
    assert.equal(edge.status, 0, edge.stderr);
    const pos = runCli(POS_CLI, ["--sample"], dir);
    assert.equal(pos.status, 0, pos.stderr);
    const sync = runCli(ANALYTICS_CLI, ["sync"], dir);
    assert.equal(sync.status, 0, sync.stderr);
    const report = runCli(ANALYTICS_CLI, ["report", "--date", "today"], dir);
    assert.equal(report.status, 0, report.stderr);

    // The shape of the defect this guards: the stub emits one entry and one
    // sale, so any ratio it prints is 1 by construction, not by observation.
    assert.match(
      report.stdout,
      /entries: 1\b/,
      "the sample pipeline should still emit exactly one door entry",
    );
    assert.match(
      report.stdout,
      /purchases: 1\b/,
      "the sample pipeline should still emit exactly one sale",
    );
    assert.doesNotMatch(
      report.stdout,
      /conversion_rate: 1\b/,
      "the pipeline must not report a 100% conversion rate it cannot measure",
    );
    assert.match(report.stdout, /conversion_rate: not measurable/);
    assert.match(report.stdout, /synthetic sample events/);

    // Assert on the real report module reading the database the real pipeline
    // wrote, not just on printed text.
    const summary = dailySummary(join(dir, "data/pilot.db"), todayIsoUtc());
    assert.equal(summary.entries, 1);
    assert.equal(summary.purchases, 1);
    assert.equal(summary.measurable, false);
    assert.equal(summary.conversion_rate, null);
    assert.ok(
      summary.unmeasurable_reason &&
        summary.unmeasurable_reason.includes("synthetic"),
      `expected a synthetic-provenance reason, got: ${summary.unmeasurable_reason}`,
    );
  });
});

test("both ingest CLIs mark their sample output as synthetic, on disk and in the database", () => {
  withTempStore((dir) => {
    assert.equal(runCli(EDGE_CLI, ["--sample"], dir).status, 0);
    assert.equal(runCli(POS_CLI, ["--sample"], dir).status, 0);

    assert.equal(
      readOnlyJson(join(dir, "data/aggregates/outbox")).synthetic,
      true,
      "the edge sample generator must declare its output synthetic",
    );
    assert.equal(
      readOnlyJson(join(dir, "data/pos/inbox")).synthetic,
      true,
      "the POS sample generator must declare its output synthetic",
    );

    assert.equal(runCli(ANALYTICS_CLI, ["sync"], dir).status, 0);

    const db = openDb(join(dir, "data/pilot.db"));
    try {
      const aggregates = db
        .prepare("SELECT synthetic FROM aggregate_events")
        .all() as Array<{ synthetic: number }>;
      const sales = db
        .prepare("SELECT synthetic FROM sale_events")
        .all() as Array<{ synthetic: number }>;
      assert.equal(aggregates.length, 1);
      assert.equal(sales.length, 1);
      assert.equal(aggregates[0]!.synthetic, 1, "edge provenance lost in sync");
      assert.equal(sales[0]!.synthetic, 1, "POS provenance lost in sync");
    } finally {
      db.close();
    }
  });
});

test("edge ingest exits non-zero when it ingests nothing", () => {
  withTempStore((dir) => {
    const result = runCli(EDGE_CLI, [], dir);
    assert.notEqual(
      result.status,
      0,
      "a cron reading exit 0 here treats a disconnected camera as a healthy run",
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Edge ingest not connected/);
    assert.equal(
      readdirSync(dir).length,
      0,
      "a failed edge ingest must not leave events behind",
    );
  });
});

test("POS ingest exits non-zero when it ingests nothing", () => {
  withTempStore((dir) => {
    const result = runCli(POS_CLI, [], dir);
    assert.notEqual(
      result.status,
      0,
      "a cron reading exit 0 here treats a dead POS adapter as a healthy run",
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /POS ingest/);
    assert.equal(
      readdirSync(dir).length,
      0,
      "a failed POS ingest must not leave events behind",
    );
  });
});
