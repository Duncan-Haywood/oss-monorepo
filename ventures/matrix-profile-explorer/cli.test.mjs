import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { main } from "./cli.mjs";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const run = (args, input) => spawnSync(process.execPath, [here("./cli.mjs"), ...args], { input: input ?? "", encoding: "utf8" });

test("--help prints usage and both citations", () => {
  const r = run(["--help"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Usage:/);
  assert.match(r.stdout, /doi:10\.1109\/ICDM\.2016\.0179/);
  assert.match(r.stdout, /doi:10\.1109\/ICDM\.2016\.0085/);
  assert.match(r.stdout, /UCR Matrix Profile/);
  assert.match(r.stdout, /No warranty/);
});

test("analyses the raw NOAA CSV by column name, as text and as JSON", () => {
  const r = run([here("./data/co2_mm_mlo.csv"), "--column", "average", "--window", "12", "--top", "3"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /#1 {2}678 \(2014-09\) {2}and {2}798 \(2024-09\)/);
  assert.match(r.stdout, /#1 {2}790 \(2024-01\)/);
  const j = run([here("./data/co2_mm_mlo.csv"), "--column", "average", "--window", "12", "--json"]);
  const res = JSON.parse(j.stdout);
  assert.equal(res.window, 12);
  assert.equal(res.motifs.length, 3);
  assert.equal(res.profile, undefined);
  const p = JSON.parse(run([here("./data/co2_mm_mlo.csv"), "--column", "4", "--window", "12", "--json", "--profile"]).stdout);
  assert.equal(p.column, "average");
  assert.equal(p.profile.length, 812);
});

test("reads stdin", () => {
  const csv = Array.from({ length: 80 }, (_, i) => String(Math.sin(i / 3) + (i === 50 ? 2 : 0))).join("\n");
  const r = run(["--window", "8", "--top", "1", "--json"], csv);
  assert.equal(r.status, 0, r.stderr);
  const res = JSON.parse(r.stdout);
  assert.equal(res.n, 80);
  assert.equal(res.discords.length, 1);
  assert.ok(res.discords[0].index > 50 - 8 && res.discords[0].index <= 50);
});

test("errors: bad column, unknown option, missing file, no input", () => {
  const bad = run([here("./data/co2_mm_mlo.csv"), "--column", "nope"]);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /No column "nope"/);
  assert.match(bad.stderr, /Columns: year, month/);
  assert.equal(run(["--bogus"]).status, 2);
  assert.equal(run(["/nonexistent/file.csv"]).status, 2);
  const empty = main([], "");
  assert.equal(empty.code, 2);
  assert.match(empty.err, /no input/);
});

test("--example runs the bundled series", () => {
  const r = main(["--example"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /2014-09/);
});
