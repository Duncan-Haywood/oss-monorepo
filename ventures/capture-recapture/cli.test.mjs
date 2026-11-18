import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { run, parseArgs, HELP } from "./cli.mjs";

const data = (f) => fileURLToPath(new URL(`./data/${f}`, import.meta.url));
const CLI = fileURLToPath(new URL("./cli.mjs", import.meta.url));

test("help cites the papers and carries the disclaimer", () => {
  const r = run(["--help"]);
  assert.equal(r.code, 0);
  for (const s of ["Chao, A. (1987)", "doi:10.2307/2531532", "Otis, D. L.", "No warranty", "Not legal"]) assert.ok(HELP.includes(s), s);
});

test("two-sample counts", () => {
  const r = run(["--n1", "60", "--n2=55", "--m", "22"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /2 occasions, 93 animals caught, 115 captures/);
  assert.match(r.out, /Chapman,147\.5,/);
  assert.match(r.out, /Lincoln-Petersen \(point\),150\.0/);
});

test("capture frequencies, the cottontail example", () => {
  const r = run(["--frequencies", "43,16,8,6,0,2,1", "--k", "18", "--json"]);
  assert.equal(r.code, 0);
  const j = JSON.parse(r.out);
  assert.equal(j.source, "frequencies");
  assert.equal(Math.round(j.groups[0].chao.N), 134);
});

test("a grouped file, and stdin", () => {
  const r = run([data("lily-pond-chorus-frogs.csv"), "--group", "year"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /Group 2010: 3 occasions, 270 animals caught/);
  const text = "ch\n110\n101\n100\n010\n011\n001\n";
  const s = run(["-", "--json"], () => text);
  assert.equal(JSON.parse(s.out).groups[0].summary.r, 6);
});

test("bad arguments exit 2, bad data exit 1", () => {
  assert.equal(run(["--nope"]).code, 2);
  assert.equal(run(["--n1"]).code, 2);
  assert.equal(run(["--k", "x"]).code, 2);
  assert.equal(run(["missing-file.csv"]).code, 2);
  const bad = run(["--n1", "5", "--n2", "5", "--m", "9"]);
  assert.equal(bad.code, 1);
  assert.match(bad.err, /cannot exceed/);
  assert.deepEqual(parseArgs(["f.csv", "--group=year"]).opts, { group: "year" });
});

test("runs as a script", () => {
  const p = spawnSync(process.execPath, [CLI, "--n1", "20", "--n2", "20", "--m", "10"], { encoding: "utf8" });
  assert.equal(p.status, 0);
  assert.match(p.stdout, /Chapman/);
  assert.ok(readFileSync(CLI, "utf8").startsWith("#!/usr/bin/env node"));
});
