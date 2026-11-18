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
  for (const s of ["Moran", "doi:10.2307/2332142", "Anselin", "Ord", "No warranty", "Not legal"]) assert.ok(HELP.includes(s), s);
});

test("the example with the neighbour list", () => {
  const r = run([data("us-state-income.csv"), "--neighbors", data("us-state-neighbors.csv"), "--var", "pci2009"]);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /Moran's I\s+0\.4288/);
  assert.match(r.out, /Connecticut\t52736/);
});

test("--json, --fdr, knn and options with =", () => {
  const r = run([data("us-state-income.csv"), "--var=pci1929", "--k=4", "--fdr", "--json", "--bands", "0"]);
  assert.equal(r.code, 0, r.err);
  const j = JSON.parse(r.out);
  assert.equal(j.options.weights, "knn");
  assert.equal(j.results[0].weights.k, 4);
  assert.equal(j.results[0].local.fdr, true);
  assert.equal(j.results[0].correlogram, undefined);
  assert.match(r.err, /warning: The false-discovery-rate cut-off/);
});

test("bad arguments and bad input fail with a message", () => {
  assert.equal(run(["--k", "x"]).code, 2);
  assert.equal(run(["--bogus"]).code, 2);
  assert.throws(() => parseArgs(["--k"]), /needs a value/);
  const r = run(["-"], "id,v\na,1\nb,2\nc,3\nd,4\ne,5\n");
  assert.equal(r.code, 1);
  assert.match(r.err, /No coordinate columns/);
});

test("runs as a script on stdin", () => {
  const p = spawnSync(process.execPath, [CLI, "--permutations", "0", "--bands", "0"], { input: "id,x,y,v\na,0,0,1\nb,1,0,2\nc,2,0,3\nd,3,0,4\ne,4,0,5\nf,5,0,6\n", encoding: "utf8" });
  assert.equal(p.status, 0, p.stderr);
  assert.match(p.stdout, /== v \(n = 6\) ==/);
});
