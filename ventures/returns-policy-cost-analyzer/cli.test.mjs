import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { run } from "./cli.mjs";

const text = readFileSync(new URL("./fixtures/orders.csv", import.meta.url), "utf8");
const io = { readFile: async () => text };

test("analyze prints categories, policies and findings; warnings alone pass by default", async () => {
  const r = await run(["analyze", "o.csv"], io);
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /Dresses/);
  assert.match(r.output, /<- best/);
  assert.match(r.output, /better-policy/);
});

test("--fail-on warn exits 1 on a warning; an error finding fails by default", async () => {
  assert.equal((await run(["analyze", "o", "--fail-on", "warn"], io)).exitCode, 1);
  const lamps = { readFile: async () => ["Lamps,30,0", ...Array.from({ length: 12 }, () => "Lamps,30,30")].join("\n") };
  assert.equal((await run(["analyze", "o"], lamps)).exitCode, 1);
});

test("--json parses; assumptions change the answer", async () => {
  const j = JSON.parse((await run(["analyze", "o", "--json"], io)).output);
  assert.equal(j.totals.orders, 220);
  assert.equal(j.policies.length, 7);
  const none = JSON.parse((await run(["analyze", "o", "--json", "--deterrence", "0", "--drag", "30"], io)).output);
  assert.ok(!none.findings.some((f) => f.rule === "better-policy"));
});

test("bad input exits 2 with a message", async () => {
  assert.equal((await run(["analyze", "o", "--drag", "80"], io)).exitCode, 2);
  assert.equal((await run(["analyze", "o", "--margin", "0"], io)).exitCode, 2);
  assert.equal((await run(["analyze", "o", "--bogus"], io)).exitCode, 2);
  assert.equal((await run(["frob", "o"], io)).exitCode, 2);
  assert.equal((await run(["analyze", "o"], { readFile: async () => "junk" })).exitCode, 2);
  assert.equal((await run(["analyze", "o"], { readFile: async () => { throw new Error("nope"); } })).exitCode, 2);
  assert.equal((await run(["--help"], io)).exitCode, 0);
});

test("the real CLI reads stdin", () => {
  const r = spawnSync(process.execPath, [new URL("./cli.mjs", import.meta.url).pathname, "analyze", "-"], { input: text, encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /return rate/);
});
