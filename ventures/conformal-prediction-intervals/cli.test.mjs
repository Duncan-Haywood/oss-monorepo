import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { run, parseArgs, HELP } from "./cli.mjs";

const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const cli = (args, input) => spawnSync(process.execPath, [here("./cli.mjs"), ...args], { input, encoding: "utf8" });

test("--help prints usage and the citations", () => {
  const r = cli(["--help"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Usage:/);
  assert.match(r.stdout, /Distribution-Free Predictive Inference for Regression/);
  assert.match(r.stdout, /Conformalized Quantile Regression/);
  assert.match(r.stdout, /10\.1080\/01621459\.2017\.1307116/);
  assert.equal(HELP, run(["--help"]).out);
});

test("a file argument gives a text table with every method", () => {
  const r = cli([here("./data/diabetes.csv"), "--target", "Y", "--coverage", "0.9", "--repeats", "0"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Split conformal \(ridge\)/);
  assert.match(r.stdout, /Locally weighted split conformal/);
  assert.match(r.stdout, /Conformalized quantile regression \(CQR\)/);
  assert.match(r.stdout, /101\/111/);
});

test("stdin and --json work together, and --method narrows the output", () => {
  const csv = "x,y\n" + Array.from({ length: 60 }, (_, i) => `${i},${(i * 7) % 13 + i}`).join("\n");
  const r = cli(["--method", "cqr", "--json", "--repeats", "0"], csv);
  assert.equal(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.deepEqual(j.methods.map((m) => m.id), ["cqr"]);
  assert.equal(j.rows.used, 60);
});

test("errors exit non-zero with a readable message", () => {
  const bad = cli([here("./data/diabetes.csv"), "--target", "nope"]);
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /Target column "nope" is not in the header/);
  assert.equal(run(["--bogus"]).code, 2);
  assert.equal(run([], "").code, 2);
  assert.throws(() => parseArgs(["--coverage"]), /needs a value/);
  assert.deepEqual(parseArgs(["d.csv", "--coverage=0.8", "--json"]), { json: true, help: false, file: "d.csv", coverage: "0.8" });
});
