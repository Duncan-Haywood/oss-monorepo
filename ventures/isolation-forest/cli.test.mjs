import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { run, parseArgs, HELP } from "./cli.mjs";

const DATA = fileURLToPath(new URL("./data/wholesale-customers.csv", import.meta.url));
const CLI = fileURLToPath(new URL("./cli.mjs", import.meta.url));

test("help cites the papers and carries the disclaimer", () => {
  const r = run(["--help"]);
  assert.equal(r.code, 0);
  for (const s of ["Zhi-Hua Zhou (2008)", "doi:10.1109/ICDM.2008.17", "doi:10.1145/2133360.2133363", "No warranty", "not financial"]) assert.ok(HELP.includes(s), s);
});

test("the example file: ranked rows, reasons and the flag line", () => {
  const r = run([DATA, "--top", "5"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /The most unusual is row 184/);
  assert.match(r.out, /\n {4}1\. row 184 +0\.\d{3} \*  Delicassen 47,943/);
  assert.match(r.out, /flagged \(score above 0\.5\): \d+ of 440 rows/);
  assert.match(r.out, /Note: Left out "Channel"/);
  assert.equal((r.out.match(/^ +\d+\. /gm) || []).length, 5);
});

test("settings flow through: columns, contamination, seed, --csv and --json", () => {
  const j = JSON.parse(run([DATA, "--columns", "Fresh,Milk,Grocery", "--contamination=0.1", "--seed", "7", "--trees", "50", "--json"]).out);
  assert.deepEqual(j.features, ["Fresh", "Milk", "Grocery"]);
  assert.equal(j.flaggedCount, 44);
  assert.equal(j.params.seed, 7);
  assert.equal(j.params.trees, 50);
  const csv = run([DATA, "--csv"]).out.split("\n");
  assert.equal(csv.length, 441);
  assert.equal(csv[0], "label,line,score,rank,flagged,mean_path_length");
  assert.match(csv[1], /^row 1,2,0\.\d{6},\d+,[01],\d+\.\d{4}$/);
});

test("errors exit non-zero", () => {
  assert.equal(run(["--nope"]).code, 2);
  assert.equal(run([], "").code, 2);
  assert.equal(run(["-"], "a,b\n1,2\n3,4").code, 1);
  assert.throws(() => parseArgs(["--trees"]));
  assert.throws(() => parseArgs(["--trees", "many"]));
  assert.throws(() => parseArgs(["--contamination", "lots"]));
});

test("runs as a real process from a pipe", () => {
  const rows = ["x,y", ...Array.from({ length: 60 }, (_, i) => `${(i % 10) / 10},${(i % 7) / 7}`), "9,9"];
  const out = execFileSync(process.execPath, [CLI, "--top", "1"], { input: rows.join("\n"), encoding: "utf8" });
  assert.match(out, /1\. row 61/);
});
