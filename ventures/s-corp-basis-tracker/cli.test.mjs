import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { parseArgs, parseOpening, render } from "./cli.mjs";
import { SAMPLE, BATCH_SAMPLE, run, parseYears } from "./calc.mjs";

const cli = new URL("./cli.mjs", import.meta.url).pathname;

test("parseArgs reads flags and rejects bad ones", () => {
  const o = parseArgs(["--opening", "20000,0,0,0", "--csv", "y.csv"]);
  assert.deepEqual([o.opening.stock, o.csv, o.file], [20000, true, "y.csv"]);
  assert.throws(() => parseArgs(["--bogus"]), /unknown option/);
  assert.throws(() => parseArgs(["--csv", "--json"]), /choose one/);
  assert.throws(() => parseArgs(["--batch", "--k1"]), /--batch/);
  assert.throws(() => parseArgs(["--opening"]), /needs four/);
  assert.throws(() => parseArgs(["a.csv", "b.csv"]), /one input file/);
});

test("opening amounts accept the page's money formats and refuse negatives", () => {
  assert.deepEqual(parseOpening("$20000, 5k"), { stock: 20000, debtBasis: 5000, debtFace: 0, suspended: 0 });
  assert.throws(() => parseOpening("-1"), /zero or more/);
  assert.throws(() => parseOpening("x"), /zero or more/);
  assert.throws(() => parseOpening("1,2,3,4,5"), /at most four/);
});

test("single-shareholder output matches the library roll-forward", () => {
  const { out, errors } = render({ opening: SAMPLE.opening }, SAMPLE.text);
  assert.deepEqual(errors, []);
  const r = run(SAMPLE.opening, parseYears(SAMPLE.text).years);
  assert.ok(out.includes("2024"));
  assert.ok(out.includes("Closing: stock $" + r.closing.stock.toLocaleString("en-US", { minimumFractionDigits: 2 })));
});

test("csv and json modes", () => {
  const csvOut = render({ csv: true, opening: SAMPLE.opening }, SAMPLE.text).out;
  assert.match(csvOut, /^year,opening_stock/);
  assert.equal(csvOut.trim().split("\n").length, 4);
  const j = JSON.parse(render({ json: true, opening: SAMPLE.opening }, SAMPLE.text).out);
  assert.equal(j.rows.length, 3);
});

test("K-1 box lines are accepted", () => {
  const { out, errors } = render({ k1: true, opening: { stock: 10000 } }, "2024: 1=50000, 16D=20000");
  assert.deepEqual(errors, []);
  assert.match(out, /Closing: stock \$40,000\.00/);
});

test("batch lists shareholders needing attention first", () => {
  const { out, errors } = render({ batch: true }, BATCH_SAMPLE);
  assert.deepEqual(errors, []);
  const first = out.split("\n")[0];
  assert.match(first, /<--/);
  assert.ok(out.includes("Casey Example"));
});

test("bad rows are reported and exit 1; empty input is an error", () => {
  const bad = render({}, "2024,0,0,0,abc,0,0,0,0");
  assert.match(bad.errors[0], /not an amount/);
  assert.match(render({}, "").errors[0], /no year rows/);
});

test("the command runs end to end", () => {
  const ok = spawnSync(process.execPath, [cli, "--example"], { encoding: "utf8" });
  assert.equal(ok.status, 0);
  assert.match(ok.stdout, /Closing:/);
  const batch = spawnSync(process.execPath, [cli, "--batch", "--html", "--example"], { encoding: "utf8" });
  assert.equal(batch.status, 0);
  assert.match(batch.stdout, /^<!doctype html>/);
  const stdin = spawnSync(process.execPath, [cli, "--csv", "-"], { input: SAMPLE.text, encoding: "utf8" });
  assert.equal(stdin.status, 0);
  const none = spawnSync(process.execPath, [cli], { encoding: "utf8" });
  assert.equal(none.status, 2);
  const help = spawnSync(process.execPath, [cli, "--help"], { encoding: "utf8" });
  assert.match(help.stdout, /Usage:/);
});
