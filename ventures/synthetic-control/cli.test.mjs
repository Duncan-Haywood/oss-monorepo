import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { run, parseArgs, toCsv, HELP } from "./cli.mjs";

const DATA = fileURLToPath(new URL("./data/germany.csv", import.meta.url));
const CLI = fileURLToPath(new URL("./cli.mjs", import.meta.url));
const BASE = [DATA, "--unit", "country", "--time", "year", "--outcome", "gdp", "--treated", "West Germany", "--at", "1990"];

test("help cites the papers and carries the disclaimer", () => {
  const r = run(["--help"]);
  assert.equal(r.code, 0);
  for (const s of ["Alberto Abadie, Javier Gardeazabal (2003)", "Hainmueller (2015)", "No warranty", "not legal"]) assert.ok(HELP.includes(s), s);
});

test("--example reproduces the paper's donors and ranks West Germany first", () => {
  const r = run(["--example"]);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /Synthetic West Germany is Austria 41\.\d%, USA 21\.\d%, Japan 16\.\d%, Switzerland 10\.\d%, Netherlands 9\.\d%/);
  assert.match(r.out, /ranks 1 of 17/);
  assert.match(r.out, /cross-validated/);
});

test("own spec from a file: covariates, donors, --no-placebo, --csv and --json", () => {
  const r = run([...BASE, "--covariates", "trade,infrate", "--donors", "USA,Austria,Japan,Switzerland,Netherlands,UK", "--no-placebo", "--no-loo"]);
  assert.equal(r.code, 0, r.err);
  assert.doesNotMatch(r.out, /Placebo/);
  assert.match(r.out, /trade \(1960-1989\)/);
  const csv = run([...BASE, "--v", "equal", "--no-placebo", "--no-loo", "--csv"]).out.split("\n");
  assert.equal(csv[0], "time,treated,synthetic,gap");
  assert.equal(csv.length, 45);
  const j = JSON.parse(run([...BASE, "--v", "equal", "--no-placebo", "--no-loo", "--json"]).out);
  assert.equal(j.treated, "West Germany");
  assert.ok(Math.abs(j.weights.reduce((a, w) => a + w.weight, 0) - 1) < 1e-9);
});

test("argument errors are reported, not thrown", () => {
  assert.equal(run(["--bogus"]).code, 2);
  assert.equal(run(["--v", "magic"]).code, 2);
  assert.equal(run(["--unit"]).code, 2);
  const r = run([DATA, "--unit", "country", "--time", "year", "--outcome", "gdp", "--treated", "Atlantis", "--at", "1990"]);
  assert.equal(r.code, 1);
  assert.match(r.err, /Atlantis/);
  assert.deepEqual(parseArgs(["--covariates=a, b"]).covariates, ["a", "b"]);
  assert.ok(typeof toCsv === "function");
});

test("the CLI runs as a process, from a file and from stdin", () => {
  const out = execFileSync(process.execPath, [CLI, ...BASE, "--v", "equal", "--no-placebo", "--no-loo"], { encoding: "utf8" });
  assert.match(out, /Synthetic West Germany is/);
  const csv = execFileSync("cat", [DATA]);
  const out2 = execFileSync(process.execPath, [CLI, "--unit", "country", "--time", "year", "--outcome", "gdp", "--treated", "West Germany", "--at", "1990", "--v", "equal", "--no-placebo", "--no-loo"], { input: csv, encoding: "utf8" });
  assert.equal(out2, out);
});
