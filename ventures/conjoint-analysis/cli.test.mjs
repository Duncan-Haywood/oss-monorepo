import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { run, parseArgs, HELP } from "./cli.mjs";

const data = (f) => fileURLToPath(new URL(`./data/${f}`, import.meta.url));
const CLI = fileURLToPath(new URL("./cli.mjs", import.meta.url));

test("help cites the papers and carries the disclaimer", () => {
  assert.equal(run(["--help"]).code, 0);
  for (const s of ["McFadden, D. (1974)", "doi:10.1177/002224379603300305", "No warranty", "not a\nforecast of sales"]) assert.ok(HELP.includes(s), s);
});

test("text output on the meal-kit example", () => {
  const r = run([data("meal-kit-simulated.csv"), "--levels", data("meal-kit-levels.txt"), "--price", "Price per serving", "--bootstrap", "0"]);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /300 respondents, 3600 tasks/);
  assert.match(r.out, /Price per serving \(per unit\),-0\.3924/);
  assert.match(r.out, /Delivery,Pick any day,Fixed weekly day,1\.09/);
});

test("--json, stdin and a simulated product", () => {
  const text = readFileSync(data("meal-kit-simulated.csv"), "utf8");
  const r = run(["-", "--levels", data("meal-kit-levels.txt"), "--bootstrap=0", "--json", "--product", '{"name":"A","Price per serving":9,"Recipes per week":"3","Menu":"Classic","Delivery":"Pick any day","Packaging":"Standard"}'], () => text);
  assert.equal(r.code, 0, r.err);
  const j = JSON.parse(r.out);
  assert.equal(j.simulator.products.length, 2);
  assert.equal(j.counts.respondents, 300);
});

test("design and merge modes round-trip", () => {
  const dir = mkdtempSync(join(tmpdir(), "cbc-"));
  writeFileSync(join(dir, "levels.txt"), "Price#: 1, 2, 3\nColour: Red, Blue, Green\n");
  const d = run(["design", join(dir, "levels.txt"), "--versions", "2", "--tasks", "3", "--concepts", "3"]);
  assert.equal(d.code, 0, d.err);
  assert.match(d.err, /D-error/);
  assert.equal(d.out.split("\n")[0], "version,task,concept,Price,Colour");
  writeFileSync(join(dir, "design.csv"), d.out);
  writeFileSync(join(dir, "answers.csv"), "respondent,version,t1,t2,t3\na,1,1,2,4\nb,2,2,2,1\n");
  const m = run(["merge", join(dir, "design.csv"), join(dir, "answers.csv")]);
  assert.equal(m.code, 0, m.err);
  assert.equal(m.out.split("\n").length, 1 + 2 * 3 * 4);
});

test("bad arguments exit 2 with a message, bad data exit 1", () => {
  assert.equal(run(["--bootstrap", "many"]).code, 2);
  assert.equal(run(["--wat"]).code, 2);
  assert.throws(() => parseArgs(["--product", "{nope"]), /needs JSON/);
  const r = run(["-"], () => "respondent,task,chosen\n1,1,1\n");
  assert.equal(r.code, 1);
  assert.match(r.err, /No attribute columns/);
  assert.equal(run(["/no/such/file.csv"]).code, 2);
});

test("runs as a script", () => {
  const p = spawnSync(process.execPath, [CLI, "--help"], { encoding: "utf8" });
  assert.equal(p.status, 0);
  assert.match(p.stdout, /choice-based conjoint/);
});
