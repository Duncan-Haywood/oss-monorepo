import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { run, parseArgs, toCsv, HELP } from "./cli.mjs";
import { analyze } from "./engine.mjs";

const DATA = fileURLToPath(new URL("./data/bh1995.csv", import.meta.url));
const CLI = fileURLToPath(new URL("./cli.mjs", import.meta.url));

test("help cites the papers and carries the disclaimer", () => {
  const r = run(["--help"]);
  assert.equal(r.code, 0);
  for (const s of ["Benjamini, Yosef Hochberg (1995)", "Storey (2002)", "Wang, Aaditya Ramdas (2022)", "No warranty", "not medical"]) assert.ok(HELP.includes(s), s);
});

test("the example file: BH keeps 4 and lists them", () => {
  const r = run([DATA]);
  assert.equal(r.code, 0);
  assert.match(r.out, /Benjamini-Hochberg keeps 4/);
  assert.match(r.out, /Kept by Benjamini-Hochberg:/);
  assert.match(r.out, /H4 /);
  assert.doesNotMatch(r.out, /H5 /);
});

test("method, alpha, --all, --csv and --json", () => {
  assert.match(run([DATA, "--method", "bonferroni"]).out, /Bonferroni keeps 3/);
  assert.match(run([DATA, "--alpha=0.1", "--method", "bky"]).out, /Two-stage BKY keeps 9/);
  assert.equal(run([DATA, "--all"]).out.split("\n").filter((l) => /^\s+\d+\s+H\d+/.test(l)).length, 15);
  const csv = run([DATA, "--csv"]).out.split("\n");
  assert.equal(csv.length, 16);
  assert.match(csv[0], /^rank,label,p_value,bonferroni_adjusted/);
  const j = JSON.parse(run([DATA, "--json"]).out);
  assert.equal(j.m, 15);
});

test("errors exit non-zero", () => {
  assert.equal(run(["--nope"]).code, 2);
  assert.equal(run([], "").code, 2);
  assert.equal(run(["-", "--alpha", "3"], "0.1\n0.2").code, 1);
  assert.throws(() => parseArgs(["--alpha"]));
});

test("e-values through stdin", () => {
  const r = run(["--kind", "e", "--alpha", "0.1"], "test,e\nA,400\nB,30\nC,0.5\nD,0\n");
  assert.equal(r.code, 0);
  assert.match(r.out, /2 pass e-BH/);
  assert.match(toCsv(analyze({ csv: "e\n5\n50", kind: "e" })), /^rank,label,e_value,ebh_adjusted,ebh_kept/);
});

test("runs as a real process from a pipe", () => {
  const out = execFileSync(process.execPath, [CLI, "--method", "holm"], { input: "0.01\n0.04\n0.03\n0.005\n", encoding: "utf8" });
  assert.match(out, /Holm keeps 2/);
});

const STREAM = fileURLToPath(new URL("./data/online-stream.csv", import.meta.url));

test("--online: arrival-order rules, their counts, the batch contrast and the order note", () => {
  const r = run([STREAM, "--online"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /^400 tests in arrival order\. LORD\+\+ keeps \d+/);
  assert.match(r.out, /Batch Benjamini-Hochberg \(hindsight\)/);
  assert.match(r.out, /Note: Order matters/);
  assert.match(run([STREAM, "--online", "--method", "saffron", "--lambda", "0.25", "--w0", "0.9"]).out, /SAFFRON keeps \d+/);
  const csv = run([STREAM, "--online", "--csv"]).out.split("\n");
  assert.equal(csv.length, 401);
  assert.match(csv[0], /^t,label,p_value,lordpp_level,saffron_level/);
  assert.equal(JSON.parse(run([STREAM, "--online", "--json"]).out).mode, "online");
  assert.equal(run([STREAM, "--online", "--method", "nope"]).code, 1);
  assert.equal(run([STREAM, "--online", "--kind", "e"]).code, 2);
  assert.ok(HELP.includes("Javanmard, Andrea Montanari (2018)") && HELP.includes("SAFFRON"));
});
