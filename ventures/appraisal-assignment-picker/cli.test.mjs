import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { run } from "./cli.mjs";

const text = readFileSync(new URL("./fixtures/assignments.csv", import.meta.url), "utf8");
const io = { readFile: async () => text };

test("plan prints the schedule, declines and baselines", async () => {
  const r = await run(["plan", "a.csv", "--hours-per-day", "6"], io);
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /^Accept 5 of 10 assignments for \$3,555\.00 net/);
  assert.match(r.output, /1\. Condo refi - Unit 4B {2}3\.5h {2}day 1/);
  assert.match(r.output, /\[warn\] decline: Rural 12 acres - Hollis Rd/);
  assert.match(r.output, /Biggest fee first: \$3,360\.00/);
});

test("--json parses and options change the answer", async () => {
  const a = JSON.parse((await run(["plan", "s", "--json", "--hours-per-day", "6"], io)).output);
  const b = JSON.parse((await run(["plan", "s", "--json", "--hours-per-day", "6", "--booked", "10", "--booked-due", "2"], io)).output);
  const c = JSON.parse((await run(["plan", "s", "--json", "--hours-per-day", "3"], io)).output);
  assert.equal(a.options.hoursPerDay, 6);
  assert.ok(b.net < a.net);
  assert.ok(b.schedule.some((s) => s.booked));
  assert.ok(c.accepted < a.accepted);
});

test("bad input exits 2", async () => {
  assert.equal((await run(["plan", "s", "--bogus"], io)).exitCode, 2);
  assert.equal((await run(["plan", "s", "--hours-per-day", "0"], io)).exitCode, 2);
  assert.equal((await run(["plan", "s", "--booked-due", "1.5"], io)).exitCode, 2);
  assert.equal((await run(["plan", "s", "--booked"], io)).exitCode, 2);
  assert.equal((await run(["plan"], io)).exitCode, 2);
  assert.equal((await run(["nope", "s"], io)).exitCode, 2);
  assert.equal((await run(["plan", "s"], { readFile: async () => "x,y" })).exitCode, 2);
  assert.equal((await run(["plan", "s"], { readFile: async () => "# only a comment" })).exitCode, 2);
  assert.equal((await run(["plan", "s"], { readFile: async () => { throw new Error("nope"); } })).exitCode, 2);
  assert.equal((await run(["--help"], io)).exitCode, 0);
});
