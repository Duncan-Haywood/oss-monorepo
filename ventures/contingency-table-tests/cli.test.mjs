import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { run, parseArgs, HELP } from "./cli.mjs";

const BERKELEY = fileURLToPath(new URL("./data/berkeley-admissions-1973.csv", import.meta.url));
const CLI = fileURLToPath(new URL("./cli.mjs", import.meta.url));

test("help cites the papers and carries the disclaimer", () => {
  assert.equal(run(["--help"]).code, 0);
  for (const s of ["Fisher", "Barnard", "Boschloo", "Mehta & Patel", "Mantel & Haenszel", "McNemar", "doi:10.2307/2342435", "No warranty", "not legal, tax, financial"]) assert.ok(HELP.includes(s), s);
});

test("the Berkeley file runs the stratified tests and finds Simpson's paradox", () => {
  const r = run([BERKELEY]);
  assert.equal(r.code, 0);
  assert.match(r.out, /Cochran-Mantel-Haenszel/);
  assert.match(r.out, /Simpson's paradox/);
  assert.match(r.out, /Breslow-Day/);
});

test("settings flow through: --table, --paired, --alternative, --unpooled, --json, named columns", () => {
  const j = JSON.parse(run(["--table", "2,15;10,3", "--alternative", "less", "--json"]).out);
  assert.equal(j.alternative, "less");
  assert.equal(j.fisher.p.toPrecision(4), "0.0004652");
  assert.match(run(["--table", "2,15;10,3", "--unpooled"]).out, /unpooled Wald/);
  const m = JSON.parse(run(["--table", "59,6;16,80", "--paired", "--json"]).out);
  assert.equal(m.mode, "paired");
  assert.equal(m.mcnemar.b, 6);
  const d = JSON.parse(run([BERKELEY, "--row", "department", "--col", "decision", "--stratum", "gender", "--json"]).out);
  assert.equal(d.rows, 6);
  assert.equal(d.mode, "independent", "a stratified test needs 2x2 strata, so 6 departments by decision is an r x c table");
});

test("errors exit non-zero", () => {
  assert.equal(run(["--nope"]).code, 2);
  assert.equal(run([], "").code, 2);
  assert.equal(run(["-"], "a,b\n1,2\n").code, 1);
  assert.equal(run(["--table", "1,2;3"]).code, 1);
  assert.throws(() => parseArgs(["--alpha"]));
  assert.throws(() => parseArgs(["--alpha", "5"]));
});

test("runs as a real process from a pipe", () => {
  const csv = "arm,outcome\n" + Array.from({ length: 30 }, (_, i) => `${i < 15 ? "drug" : "placebo"},${(i < 15 ? i % 3 : i % 2) ? "better" : "same"}`).join("\n");
  const out = execFileSync(process.execPath, [CLI], { input: csv, encoding: "utf8" });
  assert.match(out, /Fisher's exact test/);
});
