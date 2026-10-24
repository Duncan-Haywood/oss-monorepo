import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { parseArgs, run } from "./cli.mjs";

const CLI = new URL("./cli.mjs", import.meta.url).pathname;

test("parseArgs reads options and files and rejects bad input", () => {
  const o = parseArgs(["--year", "2024", "--marginal-rate", "0.43", "--losses", "1200", "--inclusion-rate", "0.5", "a.csv", "-"]);
  assert.equal(o.year, "2024");
  assert.equal(o.marginalRate, 0.43);
  assert.equal(o.losses, 1200);
  assert.equal(o.inclusionRate, 0.5);
  assert.deepEqual(o.files, ["a.csv", "-"]);
  assert.throws(() => parseArgs(["--year", "24"]), /2024/);
  assert.throws(() => parseArgs(["--marginal-rate", "43"]), /fraction/);
  assert.throws(() => parseArgs(["--losses", "-5"]), /zero or more/);
  assert.throws(() => parseArgs(["--year"]), /needs a value/);
  assert.throws(() => parseArgs(["--nope"]), /Unknown option/);
});

test("the example prints each disposition, the superficial loss, the estimate and what is still held", async () => {
  const { code, text } = await run(["--example", "--marginal-rate", "0.43"]);
  assert.equal(code, 0);
  assert.match(text, /Year 2024/);
  assert.match(text, /superficial loss: \$582\.56 denied and added to ACB/);
  assert.match(text, /Taxable capital gain at 50%: \$1,731\.66/);
  assert.match(text, /estimated tax \$744\.61/);
  assert.match(text, /BTC 0\.35 units, ACB \$10,803\.31/);
});

test("--json and --dispositions-csv, and a stdin file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cacb-"));
  const out = join(dir, "working.csv");
  const { code, text } = await run(["--example", "--json", "--dispositions-csv", out]);
  assert.equal(code, 0);
  assert.equal(JSON.parse(text).dispositions.length, 4);
  assert.match(await readFile(out, "utf8"), /^year,date,coin/);
  const r = await run(["-"], { stdin: async () => "date,type,asset,quantity,cad value\n2023-01-01,buy,BTC,1,100\n2023-06-01,sell,BTC,1,150\n" });
  assert.match(r.text, /gain \$50\.00/);
});

test("exit codes: 2 for no input, 1 when nothing is readable", async () => {
  assert.equal((await run([])).code, 2);
  const dir = await mkdtemp(join(tmpdir(), "cacb-"));
  const f = join(dir, "bad.csv");
  await writeFile(f, "x,y\n1,2\n");
  const r = await run([f]);
  assert.equal(r.code, 1);
  assert.match(r.text, /Missing a "date" column/);
});

test("runs as a script", () => {
  const r = spawnSync(process.execPath, [CLI, "--example", "--year", "2025"], { encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Year 2025/);
});
