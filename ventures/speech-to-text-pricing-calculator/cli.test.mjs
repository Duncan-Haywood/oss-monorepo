import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const run = (...a) => spawnSync(process.execPath, [new URL("./cli.mjs", import.meta.url).pathname, ...a], { encoding: "utf8" });

test("compare prints every provider and exits 0", () => {
  const r = run("compare", "--hours", "500", "--diarization", "--growth", "5");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /AssemblyAI/);
  assert.match(r.stdout, /12-month spend/);
});

test("--budget with --provider exits 1 when over", () => {
  assert.equal(run("compare", "--hours", "500", "--provider", "aws", "--budget", "100").status, 1);
  assert.equal(run("compare", "--hours", "500", "--provider", "aws", "--budget", "5000").status, 0);
});

test("bad input exits 2", () => {
  assert.equal(run("compare").status, 2);
  assert.equal(run("compare", "--hours", "-5").status, 2);
  assert.equal(run("compare", "--hours", "5", "--provider", "nope").status, 2);
  assert.equal(run("compare", "--hours", "5", "--streaming", "--diarization", "--provider", "openai").status, 2);
  assert.equal(run("bogus").status, 2);
});

test("--json is parseable and --prices overrides plans", () => {
  const dir = mkdtempSync(join(tmpdir(), "stt-"));
  const f = join(dir, "p.json");
  writeFileSync(f, JSON.stringify({ aws: { plans: [{ name: "Custom", usd: 3, hours: 5000, streaming: true, diarization: true }] } }));
  const out = JSON.parse(run("compare", "--hours", "100", "--json", "--prices", f).stdout);
  assert.equal(out.rows.find((x) => x.key === "aws").monthly, 3);
});

test("crossover lists segments; providers lists plans", () => {
  const r = run("crossover", "--diarization");
  assert.equal(r.status, 0);
  assert.match(r.stdout, /cheapest:/);
  assert.match(run("providers").stdout, /whisper-1/);
});
