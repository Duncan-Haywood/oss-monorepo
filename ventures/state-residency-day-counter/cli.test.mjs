import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { parseArgs, parseLimits, buildSpec, run } from "./cli.mjs";
import { analyze, sampleSpec } from "./calc.mjs";

const cli = new URL("./cli.mjs", import.meta.url).pathname;
const STAYS = "2025-01-01 to 2025-03-31 FL\n2025-04-01 to 2025-12-31 NY\n";

test("parseArgs reads flags and rejects bad ones", () => {
  const o = parseArgs(["--year", "2025", "--home", "fl", "--abode", "ny, fl", "--nights", "--csv", "s.txt"]);
  assert.deepEqual([o.year, o.home, o.abode, o.nights, o.csv, o.file], [2025, "FL", ["NY", "FL"], true, true, "s.txt"]);
  assert.throws(() => parseArgs(["--bogus"]), /unknown option/);
  assert.throws(() => parseArgs(["--year", "25"]), /four-digit/);
  assert.throws(() => parseArgs(["--home", "Florida"]), /two-letter/);
  assert.throws(() => parseArgs(["--csv", "--json"]), /choose one/);
  assert.throws(() => parseArgs(["--asof"]), /needs/);
  assert.throws(() => parseArgs(["--wages", "-5"]), /needs an amount/);
});

test("limits parse like the page's limits box", () => {
  assert.deepEqual(parseLimits("oh 90, GA 150"), { OH: { limit: 90 }, GA: { limit: 150 } });
  assert.throws(() => parseLimits("OH"), /not a limit/);
});

test("buildSpec matches the analysis the page would run", () => {
  const spec = buildSpec(parseArgs(["--year", "2025", "--abode", "NY"]), STAYS);
  const r = analyze(spec);
  const ny = r.states.find((s) => s.code === "NY");
  assert.equal(ny.days, 275);
  assert.equal(ny.status, "over");
  assert.equal(r.states.find((s) => s.code === "FL").days, 90);
});

test("without an abode a statutory state is not marked over", () => {
  const r = analyze(buildSpec(parseArgs(["--year", "2025"]), STAYS));
  assert.equal(r.states.find((s) => s.code === "NY").status, "no-abode");
});

test("bad stay lines and dates are reported with line numbers", () => {
  assert.throws(() => buildSpec(parseArgs(["--year", "2025"]), "2025-01-01 to 2025-01-05 FL\nsomewhere nice\n"), /Line 2/);
  assert.throws(() => buildSpec(parseArgs(["--asof", "2025-13-45"]), STAYS), /not a real date/);
});

test("run renders text, csv, daily log, html, ics and json from an in-memory file", async () => {
  const read = async () => STAYS;
  const base = ["--year", "2025", "--abode", "NY", "f.txt"];
  const text = (await run(base, { read })).out;
  assert.match(text, /NY New York\s+275\s+183/);
  assert.match(text, /Over the limit/);
  assert.match((await run(["--csv", ...base], { read })).out, /^State,Days counted/);
  const log = (await run(["--daily-log", ...base], { read })).out.trim().split("\n");
  assert.equal(log.length, 366); // header + 365 days
  assert.match((await run(["--html", ...base], { read })).out, /^<!doctype html>/);
  assert.match((await run(["--ics", ...base], { read })).out, /BEGIN:VCALENDAR/);
  const json = JSON.parse((await run(["--json", ...base], { read })).out);
  assert.equal(json.states.find((s) => s.code === "NY").days, 275);
});

test("reads standard input for -", async () => {
  const r = await run(["--year", "2025", "-"], { stdin: async () => STAYS });
  assert.match(r.out, /FL Florida/);
});

test("--example runs the built-in year and --nights changes the count", async () => {
  const inclusive = JSON.parse((await run(["--example", "--json"])).out);
  const nights = JSON.parse((await run(["--example", "--nights", "--json"])).out);
  const days = (r, c) => r.states.find((s) => s.code === c).days;
  assert.equal(days(inclusive, "NY"), analyze(sampleSpec()).states.find((s) => s.code === "NY").days);
  assert.ok(days(nights, "NY") < days(inclusive, "NY"));
});

test("a missing file argument is an error", async () => {
  await assert.rejects(() => run(["--year", "2025"]), /give a stays file/);
});

test("the script runs end to end: output, help, and a failing exit code", () => {
  const ok = spawnSync(process.execPath, [cli, "--example"], { encoding: "utf8" });
  assert.equal(ok.status, 0);
  assert.match(ok.stdout, /Residency days 2025/);
  assert.match(spawnSync(process.execPath, [cli, "--help"], { encoding: "utf8" }).stdout, /Usage:/);
  const bad = spawnSync(process.execPath, [cli, "--nope"], { encoding: "utf8" });
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /unknown option/);
});
