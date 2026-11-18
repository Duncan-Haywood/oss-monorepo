import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { run, parseArgs, HELP } from "./cli.mjs";

const EXAMPLE = fileURLToPath(new URL("./data/goemotions-sentiment.csv", import.meta.url));
const CLI = fileURLToPath(new URL("./cli.mjs", import.meta.url));

test("help cites the papers and carries the disclaimer", () => {
  assert.equal(run(["--help"]).code, 0);
  for (const s of ["Krippendorff", "Cohen", "Fleiss", "Gwet", "Shrout", "McGraw", "doi:10.1037/h0031619", "No warranty", "not legal"]) assert.ok(HELP.includes(s), s);
});

test("the example runs and reports alpha, Fleiss and Gwet", () => {
  const r = run([EXAMPLE, "--bootstrap", "100"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /Krippendorff's alpha \(nominal\)/);
  assert.match(r.out, /Gwet's AC1/);
  assert.match(r.out, /Alpha with each rater left out/);
});

test("settings flow through: --scale, --categories, --json and --csv", () => {
  const j = JSON.parse(run([EXAMPLE, "--bootstrap", "0", "--json"]).out);
  assert.equal(j.layout, "long");
  assert.equal(j.subjects, undefined);
  assert.equal(j.bootstrap, 0);
  const o = JSON.parse(run(["-", "--categories", "low,mid,high", "--json", "--bootstrap=0"], "r1,r2\nlow,mid\nmid,mid\nhigh,high\nlow,low\n").out);
  assert.equal(o.scale, "ordinal");
  assert.ok(o.cohen.quadratic);
  const csv = run([EXAMPLE, "--csv", "--bootstrap", "0"]).out.split("\n");
  assert.match(csv[0], /^subject,ratings,modal_rating,modal_share,pairwise_agreement/);
  assert.equal(csv.length, 301);
});

test("errors exit non-zero", () => {
  assert.equal(run(["--nope"]).code, 2);
  assert.equal(run([], "").code, 2);
  assert.equal(run(["-"], "a,b\n1,2\n").code, 1);
  assert.throws(() => parseArgs(["--confidence", "2"]), /between 0 and 1/);
  assert.throws(() => parseArgs(["--bootstrap", "1.5"]), /whole number/);
});

test("runs as a program, from a file and from stdin", () => {
  const out = execFileSync(process.execPath, [CLI, EXAMPLE, "--bootstrap", "0"], { encoding: "utf8" });
  assert.match(out, /Krippendorff's alpha is 0\.276/);
  const piped = execFileSync(process.execPath, [CLI, "--bootstrap", "0"], { input: "r1,r2,r3\n1,1,2\n2,2,2\n3,3,3\n1,2,1\n", encoding: "utf8" });
  assert.match(piped, /read as ordinal/);
});
