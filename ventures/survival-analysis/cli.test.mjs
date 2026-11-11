import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { run, parseArgs, HELP } from "./cli.mjs";

const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const cli = (args, input) => spawnSync(process.execPath, [here("./cli.mjs"), ...args], { input, encoding: "utf8" });

test("--help prints usage and the citations", () => {
  const r = cli(["--help"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Usage:/);
  assert.match(r.stdout, /Nonparametric Estimation from Incomplete Observations/);
  assert.match(r.stdout, /Regression Models and Life-Tables/);
  assert.match(r.stdout, /10\.1093\/biomet\/81\.3\.515/);
  assert.equal(HELP, run(["--help"]).out);
});

test("a file argument gives the groups, the log-rank line and the Cox table", () => {
  const r = cli([here("./data/leukemia.csv"), "--group", "treatment", "--covariates", "logWBC"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /6-MP\s+21\s+9\s+23\.000\s+13\.000 to NR/);
  assert.match(r.stdout, /Log-rank \(Mantel 1966\): chi-square 16\.793 on 1 df/);
  assert.match(r.stdout, /treatment=placebo vs 6-MP\s+1\.3861/);
  assert.match(r.stdout, /logWBC\s+1\.6909/);
});

test("stdin, --json and --curve work", () => {
  const csv = "days,churned,plan\n" + Array.from({ length: 40 }, (_, i) => `${(i * 7) % 31 + 1},${i % 3 ? 1 : 0},${i % 2 ? "pro" : "basic"}`).join("\n");
  const j = JSON.parse(cli(["--group", "plan", "--json"], csv).stdout);
  assert.equal(j.rows.used, 40);
  assert.deepEqual(j.groups.map((g) => g.name), ["basic", "pro"]);
  assert.equal(typeof j.logrank.p, "number");
  const t = cli(["--group", "plan", "--curve", "--test", "wilcoxon"], csv);
  assert.match(t.stdout, /Kaplan-Meier: basic/);
  assert.match(t.stdout, /Gehan-Breslow/);
});

test("errors exit non-zero with a readable message", () => {
  const bad = cli([here("./data/leukemia.csv"), "--group", "nope"]);
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /Group column "nope" is not in the header/);
  assert.equal(run(["--bogus"]).code, 2);
  assert.equal(run([], "").code, 2);
  assert.throws(() => parseArgs(["--ties"]), /needs a value/);
  assert.deepEqual(parseArgs(["d.csv", "--ties=breslow", "--json"]), { json: true, help: false, curve: false, file: "d.csv", ties: "breslow" });
});

test("--strata fits a stratified model and says so", () => {
  const r = cli([here("./data/leukemia.csv"), "--group", "treatment", "--covariates", "logWBC", "--strata", "sex"]);
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /Stratified log-rank \(Mantel 1966\): chi-square 9\.70/);
  assert.match(r.stdout, /stratified by sex: 2 strata/);
  assert.match(r.stdout, /treatment=placebo vs 6-MP\s+0\.9981/);
  assert.match(HELP, /--strata A,B/);
});
