import test from "node:test";
import assert from "node:assert/strict";
import { run } from "./cli.mjs";

const fixture = new URL("./fixtures/items.csv", import.meta.url);
const file = fixture.pathname;

test("analyze prints a table and exits 0 on a paying raise", async () => {
  const r = await run(["analyze", file, "--increase", "5", "--elasticity", "0.5"]);
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /stops paying/);
});

test("--fail-on warn exits 1 when one item loses money", async () => {
  const r = await run(["analyze", file, "--increase", "8", "--elasticity", "1.5", "--fail-on", "warn"]);
  assert.equal(r.exitCode, 1);
});

test("--json is parseable", async () => {
  const r = await run(["analyze", file, "--json"]);
  assert.ok(JSON.parse(r.output).items.length > 0);
});

test("bad input exits 2", async () => {
  assert.equal((await run(["analyze", file, "--increase", "0"])).exitCode, 2);
  assert.equal((await run(["analyze", "/no/such/file"])).exitCode, 2);
  assert.equal((await run(["nope"])).exitCode, 2);
  assert.equal((await run(["analyze", "-"], { stdin: async () => "junk" })).exitCode, 2);
});

test("help exits 0, bare exits 1", async () => {
  assert.equal((await run(["--help"])).exitCode, 0);
  assert.equal((await run([])).exitCode, 1);
});
