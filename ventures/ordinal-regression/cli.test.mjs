import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { run, parseArgs, HELP } from "./cli.mjs";

const WINE = fileURLToPath(new URL("./data/red-wine-quality.csv", import.meta.url));
const SURVEY = fileURLToPath(new URL("./eval/survey.csv", import.meta.url));
const CLI = fileURLToPath(new URL("./cli.mjs", import.meta.url));

test("help cites the papers and carries the disclaimer", () => {
  assert.equal(run(["--help"]).code, 0);
  for (const s of ["McCullagh", "Walker", "Brant", "McFadden", "Agresti", "doi:10.2307/2532457", "No warranty", "not medical"]) assert.ok(HELP.includes(s), s);
});

test("the example runs and prints Brant's test", () => {
  const r = run([WINE]);
  assert.equal(r.code, 0);
  assert.match(r.out, /Brant test of proportional odds/);
  assert.match(r.out, /All coefficients\s+chi-square 92\.847\s+df 24/);
  assert.match(r.out, /alcohol\s+0\.8883/);
});

test("settings flow through: --link, --predictors, --reference, --at, --levels, --json and --csv", () => {
  const j = JSON.parse(run([SURVEY, "--link", "probit", "--reference", "group=workshop", "--at", "age=30", "--json"]).out);
  assert.equal(j.link, "probit");
  assert.deepEqual(j.coefficients.map((c) => c.name), ["group: control", "group: brochure", "age"]);
  assert.equal(j.profile.values.age, 30);
  const k = JSON.parse(run([SURVEY, "--predictors", "age", "--levels", "Strongly agree,Agree,Neutral,Disagree,Strongly disagree", "--json"]).out);
  assert.equal(k.levels[0], "Strongly agree");
  assert.ok(k.coefficients[0].estimate > 0, "older respondents lean to the low end, which is now the top");
  const csv = run([WINE, "--csv"]).out.split("\n");
  assert.match(csv[0], /^term,type,estimate,se,z,p,lower,upper,odds_ratio,or_lower,or_upper,brant_chi2,brant_df,brant_p$/);
  assert.equal(csv.length, 12);
});

test("bad arguments and bad input give clear errors", () => {
  assert.throws(() => parseArgs(["--alpha", "2"]), /between 0 and 1/);
  assert.throws(() => parseArgs(["--at", "age"]), /COLUMN=VALUE/);
  assert.throws(() => parseArgs(["--predictors"]), /needs a value/);
  assert.throws(() => parseArgs(["--nope"]), /unknown option/);
  assert.equal(run(["/no/such/file.csv"]).code, 2);
  assert.equal(run([], "").code, 2);
  assert.equal(run(["-", "--link", "cloglog"], readFileSync(SURVEY, "utf8")).code, 1);
});

test("reads stdin as a real process", () => {
  const out = execFileSync(process.execPath, [CLI, "--predictors", "alcohol", "--outcome", "quality"], { input: readFileSync(WINE), encoding: "utf8" });
  assert.match(out, /Across 1,599 rows with quality from 3 to 8 \(6 levels\)/);
});
