import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { parseArgs, run, render } from "./cli.mjs";
import { sampleCsv } from "./calc.mjs";

const cli = new URL("./cli.mjs", import.meta.url).pathname;

test("parseArgs reads flags and rejects bad ones", () => {
  const o = parseArgs(["--months", "3", "--cohorts", "--max-churn", "4.5", "f.csv"]);
  assert.deepEqual([o.months, o.cohorts, o.maxChurn, o.file], [3, true, 4.5, "f.csv"]);
  assert.throws(() => parseArgs(["--bogus"]), /unknown option/);
  assert.throws(() => parseArgs(["--max-churn", "x"]), /number/);
});

test("run flags churn over the threshold and not under it", () => {
  const churn = run(sampleCsv()).result.summary.logoChurn * 100;
  assert.equal(run(sampleCsv(), { maxChurn: churn + 1 }).over, false);
  assert.equal(run(sampleCsv(), { maxChurn: churn - 0.5 }).over, true);
});

test("run reports an unreadable file instead of throwing", () => {
  assert.match(run("a,b\n1,2").error, /start/i);
});

test("render prints the waterfall, findings and optional cohorts", () => {
  const { result, skipped } = run(sampleCsv());
  const plain = render(result, skipped, { months: 4 });
  assert.match(plain, /Logo churn \/ month/);
  assert.match(plain, /Findings/);
  assert.doesNotMatch(plain, /Cohort logo retention/);
  assert.match(render(result, skipped, { cohorts: true }), /Cohort logo retention/);
});

test("the executable prints --example output, honours --json and exit codes", () => {
  assert.match(execFileSync("node", [cli, "--example"], { encoding: "utf8" }), /MRR now/);
  const json = JSON.parse(execFileSync("node", [cli, "--example", "--json"], { encoding: "utf8" }));
  assert.ok(json.summary.currentMrr > 0);
  assert.equal(spawnSync("node", [cli, "--example", "--max-churn", "0.01"]).status, 1);
  assert.equal(spawnSync("node", [cli, "/nonexistent.csv"]).status, 2);
});

test("stdin works with -", () => {
  const r = spawnSync("node", [cli, "-"], { input: sampleCsv(), encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Revenue LTV/);
});

test("--what-if prints the churn-reduction projection and parses its value", async () => {
  const { parseArgs, run, render } = await import("./cli.mjs");
  const { sampleCsv } = await import("./calc.mjs");
  const opts = parseArgs(["--what-if", "1.5", "--example"]);
  assert.equal(opts.whatIf, 1.5);
  const { result, skipped, subs } = run(sampleCsv(), opts);
  assert.match(render(result, skipped, { ...opts, subs }), /What if monthly churn fell 1.5 point/);
});

test("zero is a valid --max-churn and --what-if; an empty value is not", () => {
  assert.equal(parseArgs(["--max-churn", "0", "f.csv"]).maxChurn, 0);
  assert.equal(parseArgs(["--what-if", "0", "f.csv"]).whatIf, 0);
  // `--max-churn "$LIMIT"` with LIMIT unset passes "", which Number() reads as 0.
  assert.throws(() => parseArgs(["--max-churn", "", "f.csv"]), /number/);
  assert.throws(() => parseArgs(["--months", " ", "f.csv"]), /number/);
  assert.throws(() => parseArgs(["--max-churn"]), /number/);
});

test("churn exactly at --max-churn does not exceed it", () => {
  const churn = run(sampleCsv()).result.summary.logoChurn * 100;
  assert.equal(run(sampleCsv(), { maxChurn: churn }).over, false);
});

test("the cohort table prints whole percentages, matching the cohort data", () => {
  const { result, skipped } = run(sampleCsv());
  const rows = render(result, skipped, { cohorts: true }).split("\n").filter((l) => /^\d{4}-\d{2}  n=/.test(l));
  assert.equal(rows.length, result.cohorts.length);
  rows.forEach((r, i) => {
    const cells = r.replace(/^\S+\s+n=\s*\d+\s+/, "").trim().split(/\s+/).map(Number);
    assert.deepEqual(cells, result.cohorts[i].logo.slice(0, 12).map((x) => Math.round(x * 100)));
  });
  assert.ok(rows.some((r) => / 100(\s|$)/.test(r)), "a fully retained cohort-month reads 100");
});

test("skipped rows are listed from the first", () => {
  const { result } = run(sampleCsv());
  const skipped = [{ line: 2, reason: "first bad" }, { line: 9, reason: "second bad" }];
  const text = render(result, skipped, {});
  assert.match(text, /Skipped 2 unreadable/);
  assert.match(text, /line 2: first bad/);
  assert.match(text, /line 9: second bad/);
});

test("with no arguments the executable prints usage and exits 2", () => {
  const r = spawnSync("node", [cli], { encoding: "utf8" });
  assert.equal(r.status, 2);
  assert.match(r.stdout, /Usage:/);
});

test("the executable runs from a folder whose name has a space, # or %", async () => {
  const { mkdtempSync, mkdirSync, copyFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join, dirname } = await import("node:path");
  const root = mkdtempSync(join(tmpdir(), "churn-"));
  try {
    const dir = join(root, "My Projects #1 100%");
    mkdirSync(dir);
    for (const f of ["cli.mjs", "calc.mjs"]) copyFileSync(join(dirname(cli), f), join(dir, f));
    const r = spawnSync("node", [join(dir, "cli.mjs"), "--example", "--max-churn", "0.01"], { encoding: "utf8" });
    assert.match(r.stdout, /MRR now/);
    assert.equal(r.status, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
