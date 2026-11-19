import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { run, parseArgs, HELP } from "./cli.mjs";

const data = (f) => fileURLToPath(new URL(`./data/${f}`, import.meta.url));
const CLI = fileURLToPath(new URL("./cli.mjs", import.meta.url));

test("help cites the papers and carries the disclaimer", () => {
  const r = run(["--help"]);
  assert.equal(r.code, 0);
  for (const s of ["Chao, A., Gotelli, N. J.", "doi:10.1890/13-0133.1", "Hill, M. O. (1973)", "No warranty", "Not legal"]) assert.ok(HELP.includes(s), s);
});

test("a list of counts", () => {
  const r = run(["--counts", "52,30,21,12,9,7,5,4,3,3,2,2,2,1,1,1,1,1", "--bootstrap=0"]);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /n = 157, species observed = 18, singletons f1 = 5, doubletons f2 = 3/);
  assert.match(r.out, /^q=0,18,22\.14,/m);
});

test("the Portal file by treatment, as JSON", () => {
  const r = run([data("portal-rodents.csv"), "--group", "treatment", "--count", "individuals", "--bootstrap", "20", "--json"]);
  assert.equal(r.code, 0, r.err);
  const j = JSON.parse(r.out);
  assert.equal(j.groups.length, 3);
  assert.equal(j.layout, "long");
  assert.ok(j.comparison.coverage.level > 0.999);
});

test("stdin works through the real process", () => {
  const p = spawnSync(process.execPath, [CLI, "-", "--bootstrap", "0"], { input: "species,count\nA,10\nB,4\nC,1\nD,1\nE,2\n", encoding: "utf8" });
  assert.equal(p.status, 0, p.stderr);
  assert.match(p.stdout, /species observed = 5/);
});

test("bad arguments exit 2, bad data exits 1, with a message", () => {
  assert.equal(run(["--bogus"]).code, 2);
  assert.equal(run(["--counts"]).code, 2);
  assert.equal(run(["--counts", "1.5,2"]).code, 2);
  assert.equal(run(["--bootstrap", "x"]).code, 2);
  assert.equal(run(["/no/such/file.csv"]).code, 2);
  const bad = run(["-"], () => "species,count\nA,x\n");
  assert.equal(bad.code, 1);
  assert.match(bad.err, /not a whole-number count/);
  assert.deepEqual(parseArgs(["f.csv", "--group=site"]).opts, { group: "site" });
});
