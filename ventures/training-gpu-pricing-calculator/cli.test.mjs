import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const run = (...a) => spawnSync(process.execPath, [new URL("./cli.mjs", import.meta.url).pathname, ...a], { encoding: "utf8" });

test("compare prints providers, the own-it line and the projection, exit 0", () => {
  const r = run("compare", "--gpu", "h100", "--hours", "200", "--utilization", "60", "--growth", "5");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /RunPod/);
  assert.match(r.stdout, /Buy and run it yourself/);
  assert.match(r.stdout, /12-month spend/);
});

test("--budget with --provider exits 1 when over", () => {
  assert.equal(run("compare", "--gpu", "h100", "--hours", "400", "--provider", "aws", "--budget", "100").status, 1);
  assert.equal(run("compare", "--gpu", "h100", "--hours", "1", "--provider", "aws", "--budget", "100").status, 0);
});

test("bad input exits 2", () => {
  assert.equal(run("compare").status, 2);
  assert.equal(run("compare", "--gpu", "h100").status, 2);
  assert.equal(run("compare", "--gpu", "tpu", "--hours", "5").status, 2);
  assert.equal(run("compare", "--gpu", "h100", "--hours", "-5").status, 2);
  assert.equal(run("compare", "--gpu", "rtx4090", "--hours", "5", "--provider", "lambda").status, 2);
  assert.equal(run("bogus").status, 2);
});

test("--json is parseable and --prices overrides a single rate", () => {
  const dir = mkdtempSync(join(tmpdir(), "gpu-"));
  const f = join(dir, "p.json");
  writeFileSync(f, JSON.stringify({ runpod: { rates: { h100: 1 } } }));
  const out = JSON.parse(run("compare", "--gpu", "h100", "--hours", "100", "--json", "--prices", f).stdout);
  assert.equal(out.rows.find((x) => x.key === "runpod").monthly, 100);
  assert.equal(out.rows.find((x) => x.key === "lambda").rate, 2.99);
});

test("providers lists the rate table", () => {
  const r = run("providers");
  assert.equal(r.status, 0);
  assert.match(r.stdout, /h100 \$2\.99/);
});
