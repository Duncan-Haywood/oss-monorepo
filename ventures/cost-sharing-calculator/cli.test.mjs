import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { run, parseArgs, HELP } from "./cli.mjs";

const data = (f) => fileURLToPath(new URL(`./data/${f}`, import.meta.url));
const CLI = fileURLToPath(new URL("./cli.mjs", import.meta.url));

test("help cites the papers and carries the disclaimer", () => {
  const r = run(["--help"]);
  assert.equal(r.code, 0);
  for (const s of ["Shapley (1953)", "doi:10.1137/0117107", "doi:10.1287/mnsc.20.3.370", "Talmud", "No warranty", "not legal, tax or financial advice"]) assert.ok(HELP.includes(s), s);
});

test("road mode: table, core verdicts and stretches", () => {
  const r = run([data("shared-road.csv"), "--mode", "road", "--total", "18000", "--unit", "$"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /^The full length costs \$18,000.00/);
  assert.match(r.out, /\nAda +3,000.00 +600.00 +1,500.00 +1,125.00 +3,600.00\n/);
  assert.match(r.out, /Equal split: not in the core: the 3 nearest would save \$4,050.00 on their own/);
  assert.match(r.out, / {2}900 to 1,200: \$4,500.00 over 1 = \$4,500.00 each/);
});

test("claims mode reproduces the Mishnah at every estate", () => {
  const want = { 100: "33.33 +33.33 +33.33", 200: "50.00 +75.00 +75.00", 300: "50.00 +100.00 +150.00" };
  for (const [E, row] of Object.entries(want)) {
    const r = run([data("talmud-ketubot-claims.csv"), "--mode=claims", "--estate", E, "--csv"]);
    assert.equal(r.code, 0);
    const talmud = r.out.split("\n").slice(1).map((l) => Number(l.split(",")[2]).toFixed(2)).join(" ");
    assert.match(talmud, new RegExp(row.replace(/ \+/g, " ")));
  }
});

test("coalition table: --json, --csv and stdin", () => {
  const j = JSON.parse(run([data("three-towns-water.csv"), "--json"]).out);
  assert.equal(j.n, 3);
  assert.deepEqual(j.methods.find((m) => m.id === "nucleolus").x.map((v) => Math.round(v * 100) / 100), [5.9, 2.4, 3.1]);
  const csv = run([data("three-towns-water.csv"), "--csv"]).out.split("\n");
  assert.equal(csv[0], "member,standalone,shapley,nucleolus,scrb,ensc,proportional,equal");
  const out = execFileSync(process.execPath, [CLI, "--game", "value"], { input: "L,0\nR1,0\nR2,0\nL+R1,1\nL+R2,1\nR1+R2,0\nL+R1+R2,1\n" }).toString();
  assert.match(out, /Nucleolus: L 1.00, R1 0.00, R2 0.00/);
});

test("errors exit non-zero with a plain message", () => {
  assert.equal(run(["--nope"]).code, 2);
  assert.equal(run(["--mode", "pie"]).code, 2);
  assert.equal(run(["--estate", "lots"]).code, 2);
  assert.equal(run([]).code, 2);
  const r = run([data("talmud-ketubot-claims.csv"), "--mode", "claims", "--estate", "900"]);
  assert.equal(r.code, 1);
  assert.match(r.out, /paid in full/);
  assert.deepEqual(parseArgs(["x.csv", "--total=5"]), { json: false, help: false, csv: false, file: "x.csv", total: 5 });
});
