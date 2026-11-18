import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { run, parseArgs, HELP } from "./cli.mjs";

const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const cli = (args, input) => spawnSync(process.execPath, [here("./cli.mjs"), ...args], { input, encoding: "utf8" });

test("--help prints usage and the citations", () => {
  const r = cli(["--help"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Usage:/);
  assert.match(r.stdout, /Coefficient alpha and the internal structure of tests/);
  assert.match(r.stdout, /not medical, psychological/);
  assert.equal(HELP, run(["--help"]).out);
});

test("the bundled PHQ-9 answers give alpha, omega and the item table", () => {
  const r = cli([here("./data/phq9-nhanes-2017-2018.csv"), "--bootstrap", "100"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^Cronbach's alpha: 0\.824 \(95% CI 0\.810 to 0\.837, Feldt\)/);
  assert.match(r.stdout, /McDonald's omega\s+0\.838/);
  assert.match(r.stdout, /Guttman lambda-2\s+0\.837/);
  assert.match(r.stdout, /\n  self_harm_thoughts\s+0\.04\s+0\.26\s+0\.316\s+0\.828/);
  assert.match(r.stdout, /Skipped columns: seqn \(looks like an identifier\)/);
});

test("stdin, --json, --items, --reverse and --missing work", () => {
  const csv = readFileSync(here("./data/phq9-nhanes-2017-2018.csv"), "utf8");
  const j = JSON.parse(cli(["--json", "--bootstrap", "0", "--items", "interest,down,sleep,tired"], csv).stdout);
  assert.equal(j.k, 4);
  assert.equal(j.alpha.bootstrap, null);
  const t = cli(["-", "--bootstrap=0", "--reverse", "down", "--scale-min", "0", "--scale-max", "3", "--missing", "7,9"], csv);
  assert.equal(t.status, 0, t.stdout);
  assert.match(t.stdout, /down \(R\)/);
  assert.match(t.stdout, /"down" correlates negatively/);
});

test("errors exit non-zero with a readable message", () => {
  const bad = cli([here("./data/phq9-nhanes-2017-2018.csv"), "--items", "nope,down"]);
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /no column named "nope"/);
  assert.equal(run(["--bogus"]).code, 2);
  assert.equal(run([], "").code, 2);
  assert.equal(run(["--confidence", "abc"]).code, 2);
  assert.throws(() => parseArgs(["--items"]), /needs a value/);
  assert.throws(() => parseArgs(["--scale-min", "x"]), /--scale-min must be a number/);
  assert.equal(parseArgs(["d.csv", "--seed=4"]).seed, 4);
});
