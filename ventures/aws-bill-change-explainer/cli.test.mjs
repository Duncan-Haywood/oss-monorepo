import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { parseArgs, run } from "./cli.mjs";

const fx = (n) => fileURLToPath(new URL(`./fixtures/${n}`, import.meta.url));
const capture = async (argv) => {
  let out = "";
  let err = "";
  const code = await run(argv, { out: (s) => { out += s; }, err: (s) => { err += s; } });
  return { code, out, err };
};

test("parseArgs reads options in both spellings and flags unknown ones", () => {
  const a = parseArgs(["compare", "x.csv", "--before=a", "--after", "b", "--json", "--wat"]);
  assert.equal(a.sub, "compare");
  assert.deepEqual(a.positional, ["x.csv"]);
  assert.equal(a.opts.before, "a");
  assert.equal(a.opts.after, "b");
  assert.equal(a.json, true);
  assert.deepEqual(a.errors, ["unknown option --wat"]);
  assert.deepEqual(parseArgs(["compare", "--after"]).errors, ["--after needs a value"]);
});

test("one export, last two periods: exit 0, names the drivers and the disclaimer", async () => {
  const r = await capture(["compare", fx("cost-explorer-monthly.csv")]);
  assert.equal(r.code, 0);
  assert.match(r.out, /The bill rose/);
  assert.match(r.out, /EC2 - Other/);
  assert.match(r.out, /Things to check/);
  assert.match(r.out, /not billing, financial or professional advice/i);
});

test("two files, one period each, shows a new line", async () => {
  const r = await capture(["compare", fx("july.csv"), fx("august.csv")]);
  assert.equal(r.code, 0);
  assert.match(r.out, /AWS Config.*\[new\]/);
});

test("the gate exits 1 over the threshold and 0 under it", async () => {
  const over = await capture(["compare", fx("cost-explorer-monthly.csv"), "--max-increase-pct", "10"]);
  assert.equal(over.code, 1);
  assert.match(over.out, /GATE FAILED/);
  const under = await capture(["compare", fx("cost-explorer-monthly.csv"), "--max-increase-usd", "99999"]);
  assert.equal(under.code, 0);
});

test("--json is parseable and carries the gate and the disclaimer", async () => {
  const r = await capture(["compare", fx("cost-explorer-monthly.csv"), "--json"]);
  const j = JSON.parse(r.out);
  assert.equal(j.sides.after, "2026-08-01");
  assert.equal(j.gate.exceeded, false);
  assert.ok(j.disclaimer);
});

test("a missing file, a bad option and a bad period exit 2", async () => {
  assert.equal((await capture(["compare", "nope.csv"])).code, 2);
  assert.equal((await capture(["compare", fx("cost-explorer-monthly.csv"), "--bogus"])).code, 2);
  const r = await capture(["compare", fx("cost-explorer-monthly.csv"), "--before", "zzz"]);
  assert.equal(r.code, 2);
  assert.match(r.err, /not in the export/);
});

test("--help exits 0 and a bare call exits 2", async () => {
  assert.equal((await capture(["--help"])).code, 0);
  assert.equal((await capture([])).code, 2);
});
