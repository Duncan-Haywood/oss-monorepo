// The engine against BuildKit's own code. oracle-fixture.json holds 5,000
// random trees and .dockerignore files with the answers moby/patternmatcher
// and tonistiigi/fsutil gave (oracle.gen.mjs, oracle/main.go). When Go is on
// the PATH and the modules are cached, a fresh batch is also run live.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, buildTree } from "./matcher.mjs";
import { rng, genCase } from "./oracle.gen.mjs";

const sentOf = (r) => r.entries.filter((e) => e.sent).map((e) => e.path + (e.isDir ? "/" : "")).sort();

function compare(c, want) {
  const r = resolve(c.ignore, buildTree(c.files, c.dirs));
  assert.deepEqual(r.patterns, want.patterns ?? [], `patterns for ${JSON.stringify(c.ignore)}`);
  if (want.error) {
    assert.ok(r.error, `BuildKit failed (${want.error}) but the engine did not: ${JSON.stringify(c)}`);
    assert.equal(r.error.split(":")[0], want.error.split(":")[0], JSON.stringify(c));
  } else {
    assert.equal(r.error ?? null, null, `engine failed (${r.error}) where BuildKit did not: ${JSON.stringify(c)}`);
    assert.deepEqual(sentOf(r), [...want.sent].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)), JSON.stringify(c));
  }
}

test("matches BuildKit on every case in the recorded fixture", () => {
  const fx = JSON.parse(readFileSync(new URL("./oracle-fixture.json", import.meta.url), "utf8"));
  assert.ok(fx.cases.length >= 5000);
  let excluded = 0;
  for (const c of fx.cases) {
    compare(c, c);
    if (!c.error && c.files.some((f) => !c.sent.includes(f))) excluded++;
  }
  // The fixture is only worth something if the rules actually bite.
  assert.ok(excluded > 2000, `only ${excluded} cases exclude anything`);
});

const goOk = (() => {
  try {
    execFileSync("go", ["version"], { stdio: "ignore" });
    return existsSync(new URL("./oracle/go.sum", import.meta.url));
  } catch {
    return false;
  }
})();

test("matches BuildKit live on a fresh random batch", { skip: !goOk && "go not installed" }, () => {
  const r = rng(Date.now() % 1e9);
  const cases = Array.from({ length: 400 }, () => genCase(r));
  let out;
  try {
    out = execFileSync("go", ["run", "."], { cwd: new URL("./oracle/", import.meta.url), input: JSON.stringify(cases), env: { ...process.env, GOFLAGS: "-mod=mod", GOPROXY: "off" }, maxBuffer: 1 << 26, stdio: ["pipe", "pipe", "ignore"] });
  } catch {
    return; // modules not cached and no network: the fixture test still ran
  }
  const results = JSON.parse(out.toString());
  cases.forEach((c, i) => compare(c, results[i]));
});
