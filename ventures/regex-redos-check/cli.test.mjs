import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { run } from "./cli.mjs";
import { probePattern, describeAttack } from "./probe.mjs";

async function tree(files) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "redos-"));
  for (const [name, body] of Object.entries(files)) {
    const full = path.join(dir, name);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, body);
  }
  return dir;
}

test("scan walks a real tree, skips node_modules, and exits 1 on an exponential regex", async () => {
  const dir = await tree({
    "src/bad.js": "export const re = /^(\\w+\\s?)+$/;\n",
    "src/ok.ts": "export const re = /^[a-z]+$/;\n",
    "src/util.py": "import re\nre.compile(r'\\s+$')\n",
    "node_modules/dep/index.js": "module.exports = /(a+)+$/;\n",
    "README.md": "/(a+)+$/",
  });
  const { exitCode, output } = await run(["scan", dir]);
  assert.equal(exitCode, 1);
  assert.match(output, /scanned 3 source file\(s\)/);
  assert.match(output, /nested-quantifier/);
  assert.match(output, /bad\.js:1/);
  assert.match(output, /quadratic-end-anchor/);
  assert.doesNotMatch(output, /node_modules/);
});

test("--fail-on warn fails on a polynomial warning that the default tolerates", async () => {
  const dir = await tree({ "a.js": "const r = /\\s+$/;\n" });
  assert.equal((await run(["scan", dir])).exitCode, 0);
  assert.equal((await run(["scan", dir, "--fail-on", "warn"])).exitCode, 1);
});

test("clean tree exits 0; --json is machine-readable", async () => {
  const dir = await tree({ "a.js": "const r = /^[a-z]+$/;\n" });
  const { exitCode, output } = await run(["scan", dir, "--json"]);
  assert.equal(exitCode, 0);
  const parsed = JSON.parse(output);
  assert.equal(parsed.filesScanned, 1);
  assert.equal(parsed.summary.status, "ok");
});

test("--probe confirms an exponential JS suspect against the real engine", async () => {
  const dir = await tree({ "a.js": "const r = /^(\\w+\\s?)+$/;\n" });
  const { exitCode, output } = await run(["scan", dir, "--probe", "--json"]);
  assert.equal(exitCode, 1);
  const f = JSON.parse(output).findings[0];
  assert.equal(f.probe.status, "confirmed");
  assert.equal(f.probe.kind, "exponential");
  assert.match(f.message, /Confirmed: exponential/);
});

test("check analyses a single pattern", async () => {
  const bad = await run(["check", "(a+)+$"]);
  assert.equal(bad.exitCode, 1);
  assert.match(bad.output, /nested-quantifier/);
  assert.match(bad.output, /fix:/);
  const good = await run(["check", "^[a-z]+$"]);
  assert.equal(good.exitCode, 0);
  assert.match(good.output, /no backtracking risk/);
});

test("bad input exits 2 and --help exits 0", async () => {
  assert.equal((await run(["scan"])).exitCode, 2);
  assert.equal((await run(["scan", "/definitely/not/here"])).exitCode, 2);
  assert.equal((await run(["frobnicate"])).exitCode, 2);
  assert.equal((await run(["scan", ".", "--bogus"])).exitCode, 2);
  assert.equal((await run(["scan", ".", "--fail-on", "never"])).exitCode, 2);
  assert.equal((await run(["--help"])).exitCode, 0);
});

test("probe: confirms a known catastrophic pattern, leaves a linear one alone, skips invalid JS", () => {
  const bad = probePattern("^(a+)+$");
  assert.equal(bad.status, "confirmed");
  assert.equal(bad.kind, "exponential");
  assert.match(describeAttack(bad.attack), /\.repeat\(\d+\)/);
  assert.equal(probePattern("^[a-z]+$").status, "not-reproduced");
  assert.equal(probePattern("(a").status, "skipped");
});
