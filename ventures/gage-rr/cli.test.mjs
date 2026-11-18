import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { run, parseArgs, HELP } from "./cli.mjs";

const data = (f) => fileURLToPath(new URL(`./data/${f}`, import.meta.url));
const CLI = fileURLToPath(new URL("./cli.mjs", import.meta.url));

test("help cites the papers and carries the disclaimer", () => {
  const r = run(["--help"]);
  assert.equal(r.code, 0);
  for (const s of ["Burdick, R. K., Borror, C. M. & Montgomery, D. C. (2003)", "doi:10.1080/00224065.2003.11980232", "AIAG (2010)", "No warranty", "Not engineering"]) assert.ok(HELP.includes(s), s);
});

test("text output on the benchmark study", () => {
  const r = run([data("benchmark-timing.csv"), "--interaction", "keep"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /10 parts, 3 operators, 3 replicates, 90 readings/);
  assert.match(r.out, /Number of distinct categories: 6/);
  assert.match(r.out, /Total gauge R&R,[^\n]*,22\.48/);
});

test("--nested, --lsl/--usl, --json and stdin", () => {
  const text = readFileSync(data("destructive-simulated.csv"), "utf8");
  const r = run(["-", "--nested", "--lsl", "380", "--usl=440", "--json"], () => text);
  assert.equal(r.code, 0);
  const j = JSON.parse(r.out);
  assert.equal(j.design, "nested");
  assert.equal(j.tolerance, 60);
  assert.equal(j.components[0].pctTolerance.toFixed(1), "21.2");
});

test("bad options exit 2, bad data exit 1", () => {
  assert.equal(run(["--k"]).code, 2);
  assert.equal(run(["--k", "x"]).code, 2);
  assert.equal(run(["--interaction", "maybe"]).code, 2);
  assert.equal(run(["--bogus"]).code, 2);
  assert.equal(run(["a.csv", "b.csv"]).code, 2);
  assert.equal(run(["/no/such/file.csv"]).code, 2);
  assert.equal(run(["-"], () => "part,operator,measurement\n1,A,1\n").code, 1);
  assert.deepEqual(parseArgs(["f.csv", "--k", "5.15", "--part", "w"]).opts, { k: 5.15, part: "w" });
});

test("runs as a process", () => {
  const out = execFileSync(process.execPath, [CLI, data("benchmark-timing.csv")], { encoding: "utf8" });
  assert.match(out, /Gage R&R study, ANOVA method \(crossed, interaction pooled\)/);
  const bad = spawnSync(process.execPath, [CLI, "--nope"], { encoding: "utf8" });
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /unknown option --nope/);
});
