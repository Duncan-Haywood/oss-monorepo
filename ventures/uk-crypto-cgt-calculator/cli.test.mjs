import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { parseArgs, run } from "./cli.mjs";

const CLI = new URL("./cli.mjs", import.meta.url).pathname;

test("parseArgs reads options and files and rejects bad input", () => {
  const o = parseArgs(["--year", "2024-25", "--income", "45000", "--losses", "1200", "a.csv", "-"]);
  assert.equal(o.year, "2024-25");
  assert.equal(o.income, 45000);
  assert.equal(o.losses, 1200);
  assert.deepEqual(o.files, ["a.csv", "-"]);
  assert.throws(() => parseArgs(["--year", "2024"]), /2024-25/);
  assert.throws(() => parseArgs(["--income", "-5"]), /zero or more/);
  assert.throws(() => parseArgs(["--income"]), /needs a value/);
  assert.throws(() => parseArgs(["--nope"]), /Unknown option/);
});

test("the example prints each disposal with its rule, the estimate and the pools", async () => {
  const { code, text } = await run(["--example", "--income", "30000"]);
  assert.equal(code, 0);
  assert.match(text, /Tax year 2024-25/);
  assert.match(text, /same-day/);
  assert.match(text, /30-day \(2024-11-25\)/);
  assert.match(text, /Estimated CGT £380\.34/);
  assert.match(text, /Section 104 pools now:/);
});

test("--json and --disposals-csv, and a stdin file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ukcgt-"));
  const out = join(dir, "working.csv");
  const { code, text } = await run(["--example", "--json", "--disposals-csv", out]);
  assert.equal(code, 0);
  assert.equal(JSON.parse(text).disposals.length, 6);
  assert.match(await readFile(out, "utf8"), /^tax year,disposal date/);
  const r = await run(["-"], { stdin: async () => "date,type,asset,quantity,gbp value\n2023-01-01,buy,BTC,1,100\n2023-06-01,sell,BTC,1,150\n" });
  assert.match(r.text, /gain £50\.00/);
});

test("exit codes: 2 for no input or unknown year, 1 when nothing is readable", async () => {
  assert.equal((await run([])).code, 2);
  assert.equal((await run(["--example", "--year", "1999-00"])).code, 2);
  const dir = await mkdtemp(join(tmpdir(), "ukcgt-"));
  const f = join(dir, "bad.csv");
  await writeFile(f, "x,y\n1,2\n");
  const r = await run([f]);
  assert.equal(r.code, 1);
  assert.match(r.text, /Missing a "date" column/);
});

test("runs as a script", () => {
  const r = spawnSync(process.execPath, [CLI, "--example", "--year", "2024-25"], { encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Tax year 2024-25/);
});
