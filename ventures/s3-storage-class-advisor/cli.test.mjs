import test from "node:test";
import assert from "node:assert/strict";
import { run } from "./cli.mjs";

const cold = "a,10000,100000,10,100\n";
const files = (t) => ({ readFile: async (p) => { if (p === "rows.csv") return t; throw new Error("ENOENT"); } });

test("analyze prints a table and exits 0 by default", async () => {
  const { exitCode, output } = await run(["analyze", "rows.csv"], files(cold));
  assert.equal(exitCode, 0);
  assert.match(output, /glacier-ir/);
});

test("--fail-on warn exits 1 when a move saves 20%+", async () => {
  assert.equal((await run(["analyze", "rows.csv", "--fail-on", "warn"], files(cold))).exitCode, 1);
});

test("stdin and --json work", async () => {
  const { exitCode, output } = await run(["analyze", "-", "--json"], { stdin: async () => cold });
  assert.equal(exitCode, 0);
  assert.equal(JSON.parse(output).count, 1);
});

test("bad usage exits 2 and a missing file exits 2", async () => {
  assert.equal((await run(["analyze", "nope.csv"], files(cold))).exitCode, 2);
  assert.equal((await run(["analyze", "rows.csv", "--current", "tape"], files(cold))).exitCode, 2);
  assert.equal((await run(["wat"])).exitCode, 2);
  assert.equal((await run(["analyze", "rows.csv"], files("garbage"))).exitCode, 2);
});
