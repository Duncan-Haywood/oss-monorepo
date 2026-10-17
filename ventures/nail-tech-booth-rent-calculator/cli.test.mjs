import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { run } from "./cli.mjs";

const text = readFileSync(new URL("./fixtures/weeks.csv", import.meta.url), "utf8");
const io = { readFile: async () => text };

test("compare prints each arrangement, break-even and the crossover", async () => {
  const r = await run(["compare"]);
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /^24 clients a week book 30\.0 of your 36 hours/);
  assert.match(r.output, /Booth \/ chair rent +\$954\.25 +40\.0 +\$23\.86 +\$31\.81 +24\.9/);
  assert.match(r.output, /Employee \(hourly wage\) +\$671\.13 +36\.0 +\$18\.64 +\$22\.37 +not within 150/);
  assert.match(r.output, /Booth overtakes commission at 13\.0 clients a week; overtakes employee at 18\.6/);
  assert.match(r.output, /not tax advice/);
});

test("compare --json and flags change the answer", async () => {
  const a = JSON.parse((await run(["compare", "--json"])).output);
  const b = JSON.parse((await run(["compare", "--json", "--rent", "450", "--clients", "12"])).output);
  assert.ok(b.models[0].takeHome < a.models[0].takeHome);
  assert.equal(b.options.rentPerWeek, 450);
});

test("history groups by arrangement and ranks weeks", async () => {
  const r = await run(["history", "w.csv"], io);
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /^6 of 8 weeks took home under \$25\.00 per hour worked/);
  assert.match(r.output, /booth: 4 weeks, \$3,974\.34 take-home for 161 h = \$24\.69\/h, 39% of hours idle/);
  assert.match(r.output, /1\. 2026-08-24 \(employee\)/);
});

test("history --json honours --target", async () => {
  const j = JSON.parse((await run(["history", "w.csv", "--target", "17", "--json"], io)).output);
  assert.equal(j.below, 0);
});

test("bad input exits 2 with usage", async () => {
  for (const argv of [[], ["nope"], ["compare", "--bogus"], ["compare", "--rent"], ["compare", "--clients", "x"], ["history"]]) {
    const r = await run(argv, io);
    assert.equal(r.exitCode, 2, argv.join(" "));
    assert.match(r.output, /Usage:/);
  }
  const bad = await run(["history", "w.csv"], { readFile: async () => "A,booth,x,1,1,1" });
  assert.equal(bad.exitCode, 2);
  assert.match(bad.output, /Line 1: pay/);
  const missing = await run(["history", "w.csv"], { readFile: async () => { throw new Error("nope"); } });
  assert.match(missing.output, /Cannot read w\.csv/);
  assert.equal((await run(["--help"])).exitCode, 0);
});
