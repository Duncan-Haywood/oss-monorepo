import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { run } from "./cli.mjs";

const sites = readFileSync(new URL("./fixtures/sites.csv", import.meta.url), "utf8");
const seasons = readFileSync(new URL("./fixtures/seasons.csv", import.meta.url), "utf8");
const io = { readFile: async (f) => (f.includes("seasons") ? seasons : sites) };

test("compare prints the year costs, each model, the flat prices and the walk-away", async () => {
  const r = await run(["compare"]);
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /^A normal year is 44 plows and 74\.1 hours across 3 sites, costing \$6,171\.75/);
  assert.match(r.output, /normal +44 +74\.1 +\$6,171\.75/);
  assert.match(r.output, /Seasonal flat +\$10,300\.00 +\$250\.89 +\$55\.75 +-\$4\.82/);
  assert.match(r.output, /needed for target: {2}low year \$3,661\.50/);
  assert.match(r.output, /loses money below: {2}low year \$2,585\.25 +normal \$6,171\.75 +high \$10,934\.63/);
  assert.match(r.output, /walk-away price: +\$8,115\.56/);
  assert.match(r.output, /not market rates/);
});

test("compare reads --sites from a file and matches the default fixture", async () => {
  const a = await run(["compare"]);
  const b = await run(["compare", "--sites", "sites.csv"], io);
  assert.equal(a.output, b.output);
});

test("flags change the answer, --json is parseable", async () => {
  const a = JSON.parse((await run(["compare", "--json"])).output);
  const b = JSON.parse((await run(["compare", "--json", "--high", "20,15,8", "--truck", "90", "--target", "50"])).output);
  assert.ok(b.seasons.high.cost > a.seasons.high.cost);
  assert.equal(b.options.targetHourly, 50);
  assert.equal(a.models.length, 5);
});

test("audit groups by model and ranks site-seasons", async () => {
  const r = await run(["audit", "seasons.csv"], io);
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /^3 of 9 site-seasons earned under \$35\.00 an hour after \$75\.00 an hour/);
  assert.match(r.output, /per-push: 3 rows, \$14,100\.00 for 83 h = \$169\.88\/h gross, \$94\.88\/h net/);
  assert.match(r.output, /1\. Oak Ridge HOA \(seasonal\)/);
});

test("audit --json honours --target", async () => {
  const j = JSON.parse((await run(["audit", "seasons.csv", "--target", "0", "--json"], io)).output);
  assert.equal(j.below, 1);
  const k = JSON.parse((await run(["audit", "seasons.csv", "--json"], io)).output);
  assert.equal(k.below, 3);
});

test("bad input exits 2 with usage", async () => {
  for (const argv of [[], ["nope"], ["compare", "--bogus"], ["compare", "--target"], ["compare", "--normal", "1,2"], ["compare", "--sites"], ["audit"], ["audit", "seasons.csv", "--truck", "x"]]) {
    const r = await run(argv, io);
    assert.equal(r.exitCode, 2, argv.join(" "));
    assert.match(r.output, /Usage:/);
  }
  const bad = await run(["audit", "s.csv"], { readFile: async () => "A,flat,x,1" });
  assert.equal(bad.exitCode, 2);
  assert.match(bad.output, /Line 1: revenue/);
  const badSites = await run(["compare", "--sites", "s.csv"], { readFile: async () => "A,1" });
  assert.match(badSites.output, /Line 1: expected name/);
  const missing = await run(["audit", "s.csv"], { readFile: async () => { throw new Error("nope"); } });
  assert.match(missing.output, /Cannot read s\.csv/);
  assert.equal((await run(["--help"])).exitCode, 0);
});
