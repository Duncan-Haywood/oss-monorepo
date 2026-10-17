import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { run } from "./cli.mjs";

const classes = readFileSync(new URL("./fixtures/classes.csv", import.meta.url), "utf8");
const appts = readFileSync(new URL("./fixtures/appointments.csv", import.meta.url), "utf8");
const io = (text) => ({ readFile: async () => text });

test("compare prints each class with price for target and walk-away", async () => {
  const r = await run(["compare", "c.csv"], io(classes));
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /^5 of 6 classes earn under \$60\.00/);
  assert.match(r.output, /Giant +\$150\.00 +180 +\$42\.43 +\$205\.47 +\$158\.11/);
  assert.match(r.output, /Matted/);
  assert.match(r.output, /not market rates/);
});

test("compare flags change the answer and --json parses", async () => {
  const a = JSON.parse((await run(["compare", "c.csv", "--json"], io(classes))).output);
  const b = JSON.parse((await run(["compare", "c.csv", "--json", "--drive", "30", "--target", "50"], io(classes))).output);
  assert.equal(a.options.driveMinutes, 0);
  assert.equal(b.options.driveMinutes, 30);
  assert.equal(b.options.targetHourly, 50);
});

test("audit ranks classes and says what to raise", async () => {
  const r = await run(["audit", "a.csv"], io(appts));
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /^5 of 6 classes underpay \$60\.00/);
  assert.match(r.output, /1\. Giant: 2 dogs, avg \$155\.00 in 205 min = \$41\.43\/h {2}raise \$66\.79 a dog/);
  assert.match(r.output, /Small smooth.*at target/);
});

test("bad input exits 2 with usage", async () => {
  for (const argv of [[], ["nope"], ["compare", "--bogus"], ["compare"], ["audit", "a.csv", "--drive"], ["audit", "a.csv", "--drive", "x"]]) {
    const r = await run(argv, io(appts));
    assert.equal(r.exitCode, 2, argv.join(" "));
    assert.match(r.output, /Usage:/);
  }
  const bad = await run(["audit", "a.csv"], io("A,x,1"));
  assert.match(bad.output, /Line 1: price/);
  assert.match((await run(["compare", "c.csv"], io("A,x,1"))).output, /Line 1: price/);
  assert.match((await run(["audit", "a.csv"], io("# nothing"))).output, /No appointment rows/);
  assert.match((await run(["compare", "c.csv"], io("# nothing"))).output, /No class rows/);
  const missing = await run(["audit", "p.csv"], { readFile: async () => { throw new Error("nope"); } });
  assert.match(missing.output, /Cannot read p\.csv/);
  assert.equal((await run(["--help"])).exitCode, 0);
});
