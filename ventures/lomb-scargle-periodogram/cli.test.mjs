import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { run, parseArgs, HELP } from "./cli.mjs";

const DATA = fileURLToPath(new URL("./data/hd164922-rv.csv", import.meta.url));
const CLI = fileURLToPath(new URL("./cli.mjs", import.meta.url));

test("help cites the papers and carries the disclaimer", () => {
  assert.equal(run(["--help"]).code, 0);
  for (const s of ["Lomb", "Scargle", "Zechmeister", "doi:10.1111/j.1365-2966.2008.12689.x", "VanderPlas", "No warranty", "not financial"]) assert.ok(HELP.includes(s), s);
});

test("the example file: the two planets known in 2016 come first", () => {
  const r = run([DATA, "--signals", "2"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /Signal 1: period 1,19\d/);
  assert.match(r.out, /Signal 2: period 75\.7\d/);
  assert.match(r.out, /Sampling rhythms/);
});

test("settings flow through: --jitter, --signals, --json and --csv", () => {
  const j = JSON.parse(run([DATA, "--jitter", "2.6", "--signals", "4", "--json"]).out);
  assert.equal(j.n, 401);
  assert.equal(j.found.length, 4);
  assert.equal(j.frequency, undefined);
  const csv = run([DATA, "--min-period", "10", "--max-period", "100", "--csv"]).out.split("\n");
  assert.equal(csv[0], "frequency,period,power,window_power,power_after_first_signal");
  assert.ok(csv.length > 100);
  const noGroups = JSON.parse(run([DATA, "--group", "", "--signals", "1", "--json"]).out);
  assert.equal(noGroups.groups.length, 1);
});

test("errors exit non-zero", () => {
  assert.equal(run(["--nope"]).code, 2);
  assert.equal(run([], "").code, 2);
  assert.equal(run(["-"], "a,b\n1,2\n").code, 1);
  assert.throws(() => parseArgs(["--signals"]));
  assert.throws(() => parseArgs(["--signals", "two"]));
  assert.throws(() => parseArgs(["--min-period", "0"]));
  assert.throws(() => parseArgs(["--jitter", "-1"]));
});

test("runs as a real process from a pipe", () => {
  const rows = ["day,brightness"];
  for (let i = 0; i < 80; i++) {
    const t = i * 1.37 + (i % 5) * 0.21;
    rows.push(`${t.toFixed(3)},${(10 + 2 * Math.sin((2 * Math.PI * t) / 6.5)).toFixed(4)}`);
  }
  const out = execFileSync(process.execPath, [CLI, "--signals", "1"], { input: rows.join("\n"), encoding: "utf8" });
  assert.match(out, /Signal 1: period 6\.5\b/);
});
