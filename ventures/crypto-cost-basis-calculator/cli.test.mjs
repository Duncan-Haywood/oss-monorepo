import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { parseArgs, run, render } from "./cli.mjs";
import { SAMPLE_CSV, analyze } from "./calc.mjs";

const CLI = new URL("./cli.mjs", import.meta.url).pathname;

test("parseArgs reads options and files", () => {
  const o = parseArgs(["--method", "hifo", "--year", "2024", "--per-wallet", "--short-rate", "30", "a.csv", "b.csv"]);
  assert.equal(o.method, "HIFO");
  assert.equal(o.year, 2024);
  assert.equal(o.perWallet, true);
  assert.equal(o.shortRate, 0.3);
  assert.deepEqual(o.files, ["a.csv", "b.csv"]);
});

test("parseArgs rejects bad input", () => {
  assert.throws(() => parseArgs(["--method", "RANDOM"]), /one of/);
  assert.throws(() => parseArgs(["--year", "24"]), /four-digit/);
  assert.throws(() => parseArgs(["--long-rate", "150"]), /percent/);
  assert.throws(() => parseArgs(["--year"]), /needs a value/);
  assert.throws(() => parseArgs(["--nope"]), /unknown option/);
});

test("run agrees with analyze on the same CSV", () => {
  const r = run([{ name: "s.csv", text: SAMPLE_CSV }], { method: "HIFO" });
  const direct = analyze(SAMPLE_CSV, { method: "HIFO" });
  assert.equal(r.result.summary.totalGain, direct.summary.totalGain);
  assert.equal(r.result.tax, direct.tax);
  assert.equal(r.error, null);
});

test("render reports gains, comparison and holdings", () => {
  const text = render(run([{ name: "s.csv", text: SAMPLE_CSV }], { method: "FIFO" }), { shortRate: 0.24, longRate: 0.15 });
  assert.match(text, /Sales in 2024/);
  assert.match(text, /total \$23,748\.00/);
  assert.match(text, /lowest estimated tax/);
  assert.match(text, /Still held/);
});

test("a file with no sales says so instead of printing zeros", () => {
  const csv = "date,type,asset,quantity,total,fee,wallet\n2023-01-10,buy,BTC,1,20000,0,A\n";
  assert.match(render(run([{ name: "b.csv", text: csv }], {})), /No sales found/);
});

test("missing-basis sale is flagged in the summary", () => {
  const csv = "date,type,asset,quantity,total,fee,wallet\n2024-05-01,sell,BTC,1,60000,0,A\n";
  const text = render(run([{ name: "m.csv", text: csv }], {}));
  assert.match(text, /no purchase on record/);
  assert.match(text, /warning:/);
});

test("command line: file in, Form 8949 rows out, exit codes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cbc-"));
  const input = join(dir, "h.csv"), out = join(dir, "8949.csv");
  await writeFile(input, SAMPLE_CSV);
  const stdout = execFileSync("node", [CLI, "--method", "HIFO", "--form8949", out, input], { encoding: "utf8" });
  assert.match(stdout, /Highest cost first/);
  const rows = (await readFile(out, "utf8")).trim().split("\n");
  assert.equal(rows.length, 4);
  assert.match(rows[1], /^0\.35 BTC,2023-06-15,2024-09-20,20979\.00,10510\.50,10468\.50,Long/);
  const bad = spawnSync("node", [CLI, "--method", "x", input], { encoding: "utf8" });
  assert.equal(bad.status, 2);
  const none = spawnSync("node", [CLI], { encoding: "utf8" });
  assert.equal(none.status, 2);
  const json = JSON.parse(execFileSync("node", [CLI, "--json", "--example"], { encoding: "utf8" }));
  assert.equal(json.year, 2024);
});
