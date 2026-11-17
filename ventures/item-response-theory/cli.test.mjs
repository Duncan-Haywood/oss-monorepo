import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { run, parseArgs, HELP } from "./cli.mjs";
import { SAMPLE_TEXT } from "./engine.mjs";

const LSAT = fileURLToPath(new URL("./data/lsat6.csv", import.meta.url));
const CLI = fileURLToPath(new URL("./cli.mjs", import.meta.url));

test("help cites the papers and carries the disclaimer", () => {
  const r = run(["--help"]);
  assert.equal(r.code, 0);
  for (const s of ["Bock, R. D. & Aitkin, M. (1981)", "doi:10.1007/BF02293801", "doi:10.1177/01466216000241003", "No warranty", "not a substitute for a"]) assert.ok(HELP.includes(s), s);
});

test("text output: headline, models and the item table", () => {
  const r = run([LSAT]);
  assert.equal(r.code, 0);
  assert.match(r.out, /^1,000 people, 5 items: the 1PL/);
  assert.match(r.out, /chi-square 0\.57 on 4 df, p = 0\.967/);
  assert.match(r.out, /1PL log-likelihood -2466\.938/);
  assert.match(r.out, /item1 +0\.76 \(0\.07\) +-3\.62 \(0\.33\)/);
});

test("--items, --people, --report, --json, --model, --key and stdin", () => {
  const items = run([LSAT, "--items", "--model", "2pl"]).out.split("\n");
  assert.equal(items[0], "item,a,a_se,b,b_se,p_correct,item_rest_r,sx2,sx2_df,sx2_p,flags");
  assert.match(items[1], /^"item1",0\.826,/);
  assert.equal(run([LSAT, "--people"]).out.trim().split("\n").length, 31);
  assert.match(run([LSAT, "--report"]).out, /^# Item response theory report/);
  const j = JSON.parse(run([LSAT, "--json", "--no-se"]).out);
  assert.equal(j.itemTable[0].aSE, null);
  const body = SAMPLE_TEXT.split("\n").filter((l) => !l.startsWith("key,")).join("\n");
  const keyed = JSON.parse(execFileSync(process.execPath, [CLI, "--json", "--key", "BDACAB"], { input: body }).toString());
  const rowKey = JSON.parse(run(["-", "--json"], SAMPLE_TEXT).out);
  assert.equal(keyed.fit.logLik, rowKey.fit.logLik);
});

test("bad input exits non-zero with a message", () => {
  assert.equal(run(["--model", "3pl"]).code, 2);
  assert.throws(() => parseArgs(["--key"]), /needs a value/);
  assert.equal(run(["a.csv", "b.csv"]).code, 2);
  assert.equal(run(["--bogus"]).code, 2);
  const tiny = spawnSync(process.execPath, [CLI], { input: "a,b\n1,0\n0,1\n" });
  assert.equal(tiny.status, 1);
  assert.match(tiny.stderr.toString(), /At least 20 people/);
  assert.equal(spawnSync(process.execPath, [CLI, "missing-file.csv"]).status, 2);
});
