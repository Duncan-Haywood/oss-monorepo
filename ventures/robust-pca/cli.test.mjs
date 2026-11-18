import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { run, parseArgs, HELP } from "./cli.mjs";

const DATA = fileURLToPath(new URL("./data/aep-2017-day-by-hour.csv", import.meta.url));
const CLI = fileURLToPath(new URL("./cli.mjs", import.meta.url));

test("help cites the papers and carries the disclaimer", () => {
  const r = run(["--help"]);
  assert.equal(r.code, 0);
  for (const s of ["Candes", "doi:10.1145/1970392.1970395", "arxiv.org/abs/1009.5055", "doi:10.1137/0106005", "No warranty", "not financial"]) assert.ok(HELP.includes(s), s);
});

test("the example file: rows, cells and the filled gap", () => {
  const r = run([DATA, "--top", "5"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /365 rows by 24 columns/);
  assert.match(r.out, /2017-08-21 +\d+ +[\d,.]+/);
  assert.match(r.out, /2017-03-12 +he03 +13,8\d\d/);
  assert.match(r.out, /certified gap/);
});

test("settings flow through: --sensitivity, --columns, --csv and --json", () => {
  const j = JSON.parse(run([DATA, "--sensitivity", "2", "--columns", "he01,he02,he03,he04", "--json"]).out);
  assert.equal(j.n, 4);
  assert.equal(j.sensitivity, 2);
  assert.equal(j.L, undefined);
  const csv = run([DATA, "--columns", "he10,he11", "--csv"]).out.split("\n");
  assert.equal(csv[0], "row,column,observed,low_rank,sparse,flagged");
  assert.equal(csv.length, 1 + 365 * 2);
  assert.match(csv[1], /^2017-01-01,he10,13644,/);
});

test("errors exit non-zero", () => {
  assert.equal(run(["--nope"]).code, 2);
  assert.equal(run([], "").code, 2);
  assert.equal(run(["-"], "a\n1\n2").code, 1);
  assert.throws(() => parseArgs(["--fold"]));
  assert.throws(() => parseArgs(["--fold", "many"]));
  assert.throws(() => parseArgs(["--scale", "z"]));
  assert.throws(() => parseArgs(["--sensitivity", "0"]));
});

test("runs as a real process from a pipe, folding one series", () => {
  const rows = ["t,v"];
  for (let d = 0; d < 12; d++) for (let h = 0; h < 6; h++) rows.push(`d${d}-${h},${(d + 1) * (h + 1) + (d === 4 && h === 2 ? 50 : 0)}`);
  const out = execFileSync(process.execPath, [CLI, "--fold", "6"], { input: rows.join("\n"), encoding: "utf8" });
  assert.match(out, /12 rows by 6 columns split into one shared pattern \(rank 1\)/);
  assert.match(out, /d4-0 +1 +50/);
});
