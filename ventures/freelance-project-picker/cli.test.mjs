import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { run } from "./cli.mjs";

const text = readFileSync(new URL("./fixtures/projects.csv", import.meta.url), "utf8");
const io = { readFile: async () => text };

test("plan prints accept and decline sections with break-even fees", async () => {
  const r = await run(["plan", "p.csv"], io);
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /Accept 4 of 7 offers for \$12,700/);
  assert.match(r.output, /\+ \$6,000 {2}60h {2}by week 3/);
  assert.match(r.output, /Mobile app MVP -- .* would earn its place at \$7,400/);
  assert.match(r.output, /best rate first \$11,300/);
});

test("--json parses and --buffer changes the answer", async () => {
  const a = JSON.parse((await run(["plan", "p", "--json"], io)).output);
  const b = JSON.parse((await run(["plan", "p", "--json", "--buffer", "20"], io)).output);
  assert.equal(a.totals.plan, 12700);
  assert.notEqual(a.totals.plan, b.totals.plan);
});

test("bad input exits 2", async () => {
  assert.equal((await run(["plan", "p", "--bogus"], io)).exitCode, 2);
  assert.equal((await run(["plan", "p", "--buffer", "abc"], io)).exitCode, 2);
  assert.equal((await run(["plan"], io)).exitCode, 2);
  assert.equal((await run(["nope", "p"], io)).exitCode, 2);
  assert.equal((await run(["plan", "p"], { readFile: async () => "capacity,,10\n" })).exitCode, 2);
  assert.equal((await run(["plan", "p"], { readFile: async () => "project,100,5,1\n" })).exitCode, 2);
  assert.equal((await run(["plan", "p"], { readFile: async () => { throw new Error("nope"); } })).exitCode, 2);
});

test("real process: stdin works and exit codes propagate", () => {
  const ok = spawnSync("node", [new URL("./cli.mjs", import.meta.url).pathname, "plan", "-"], { input: text, encoding: "utf8" });
  assert.equal(ok.status, 0);
  assert.match(ok.stdout, /Accept 4 of 7/);
  const bad = spawnSync("node", [new URL("./cli.mjs", import.meta.url).pathname, "plan", "-"], { input: "x,1", encoding: "utf8" });
  assert.equal(bad.status, 2);
});
