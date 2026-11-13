import { test } from "node:test";
import assert from "node:assert/strict";
import { run, parseArgs, HELP } from "./cli.mjs";
import { CONTACTS } from "./example-data.mjs";
import { parseCsv } from "./engine.mjs";

const input = () => CONTACTS;

test("help cites the papers", () => {
  assert.match(run(["--help"]).out, /Fellegi/);
  assert.match(HELP, /Winkler/);
});

test("text output lists groups and held-back pairs", () => {
  const { out } = run(["x.csv"], input);
  assert.match(out, /^8 groups of likely duplicates/);
  assert.match(out, /Bob \| Lindqvist/);
  assert.match(out, /different first names, held back/);
});

test("--merged and --annotated produce CSVs; --no-name-guard merges the colleagues", () => {
  const { files } = run(["x.csv", "--merged", "m.csv", "--annotated", "a.csv"], input);
  assert.equal(parseCsv(files["m.csv"]).rows.length, 13);
  assert.equal(parseCsv(files["a.csv"]).rows.length, 21);
  const loose = run(["x.csv", "--no-name-guard", "--json"], input);
  assert.ok(JSON.parse(loose.out).groups.length < 8 || JSON.parse(loose.out).rowsInGroups > 16);
});

test("--column overrides a guessed type and bad options are refused", () => {
  const r = JSON.parse(run(["x.csv", "--column", "Company=ignore", "--json"], input).out);
  assert.ok(!r.fields.includes("company"));
  assert.throws(() => parseArgs(["--threshold", "2"]), /between 0 and 1/);
  assert.throws(() => parseArgs(["--column", "Company=nope"]), /unknown type/);
  assert.throws(() => run(["x.csv", "--column", "Nope=email"], input), /no column named/);
});
