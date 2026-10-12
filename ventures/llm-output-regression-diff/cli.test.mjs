import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const run = (...a) => spawnSync(process.execPath, [new URL("./cli.mjs", import.meta.url).pathname, ...a], { encoding: "utf8" });
const dir = mkdtempSync(join(tmpdir(), "lord-"));
const w = (name, lines) => { const f = join(dir, name); writeFileSync(f, lines.map((l) => JSON.stringify(l)).join("\n")); return f; };
const base = w("base.jsonl", [{ id: "a", output: '{"x":1}' }, { id: "b", output: "Plain answer here." }]);
const same = w("same.jsonl", [{ id: "a", output: '{"x":1}' }, { id: "b", output: "Plain answer here." }]);
const bad = w("bad.jsonl", [{ id: "a", output: "Sure, x is 1." }, { id: "b", output: "Plain answer here." }]);

test("identical files exit 0", () => {
  const r = run("diff", base, same);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /2 clean/);
});

test("a regression exits 1 and names the case and rule; --max-regressions allows it", () => {
  const r = run("diff", base, bad);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /REGRESSED\s+a/);
  assert.match(r.stdout, /json-broken/);
  assert.equal(run("diff", base, bad, "--max-regressions", "1").status, 0);
});

test("--json is parseable", () => {
  const out = JSON.parse(run("diff", base, bad, "--json").stdout);
  assert.equal(out.summary.errorCases, 1);
  assert.equal(out.verdict.fail, true);
});

test("bad input exits 2", () => {
  assert.equal(run().status, 2);
  assert.equal(run("diff", base).status, 2);
  assert.equal(run("diff", base, join(dir, "nope.jsonl")).status, 2);
  assert.equal(run("diff", base, same, "--fail-on", "x").status, 2);
  assert.equal(run("diff", base, same, "--min-similarity", "2").status, 2);
  const junk = join(dir, "junk.jsonl"); writeFileSync(junk, "not json");
  assert.equal(run("diff", junk, same).status, 2);
});
