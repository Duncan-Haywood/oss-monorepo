import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { run, parseArgs } from "./cli.mjs";

const MIXED = readFileSync(new URL("./fixtures/plan-mixed.json", import.meta.url), "utf8");
const SAVINGS = readFileSync(new URL("./fixtures/plan-savings.json", import.meta.url), "utf8");
const files = (map) => async (p) => {
  if (!(p in map)) throw new Error(`ENOENT: no such file, open '${p}'`);
  return map[p];
};
const io = { readFile: files({ "mixed.json": MIXED, "savings.json": SAVINGS, "bad.json": "{nope", "np.json": "{}" }) };

test("parseArgs handles = and space forms and rejects unknown options", () => {
  const a = parseArgs(["estimate", "p.json", "--max-delta", "50", "--region=eu-west-1", "--json"]);
  assert.equal(a.maxDelta, "50");
  assert.equal(a.region, "eu-west-1");
  assert.equal(a.json, true);
  assert.equal(parseArgs(["estimate", "p.json", "--max-delta=7"]).maxDelta, "7");
  assert.ok(parseArgs(["estimate", "--wat"]).errors.length);
  assert.ok(parseArgs(["estimate", "p.json", "--max-delta"]).errors.length);
});

test("--help exits 0 and carries the disclaimer; no args exits 1", async () => {
  const h = await run(["--help"], io);
  assert.equal(h.exitCode, 0);
  assert.match(h.output, /not a quote/);
  assert.match(h.output, /--max-delta/);
  assert.equal((await run([], io)).exitCode, 1);
});

test("no budget: reports and exits 0 even for a large delta", async () => {
  const { exitCode, output } = await run(["estimate", "mixed.json"], io);
  assert.equal(exitCode, 0);
  assert.match(output, /\+\$1,277\.86\/month/);
  assert.match(output, /Top cost drivers/);
  assert.match(output, /UNPRICED -- 2/);
  assert.match(output, /Usage-based/);
});

test("--max-delta below the delta exits 1 and says BUDGET EXCEEDED", async () => {
  const { exitCode, output } = await run(["estimate", "mixed.json", "--max-delta", "100"], io);
  assert.equal(exitCode, 1);
  assert.match(output, /BUDGET EXCEEDED/);
  assert.match(output, /real delta may be higher/);
});

test("--max-delta at or above the delta exits 0", async () => {
  assert.equal((await run(["estimate", "mixed.json", "--max-delta=1277.86"], io)).exitCode, 0);
  const ok = await run(["estimate", "mixed.json", "--max-delta", "5000"], io);
  assert.equal(ok.exitCode, 0);
  assert.match(ok.output, /Budget ok/);
});

test("a plan that saves money passes --max-delta 0", async () => {
  const r = await run(["estimate", "savings.json", "--max-delta", "0"], io);
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /-\$243\.09/);
});

test("--json carries totals, budget, unpriced and the disclaimer", async () => {
  const { exitCode, output } = await run(["estimate", "mixed.json", "--max-delta", "100", "--json"], io);
  const j = JSON.parse(output);
  assert.equal(exitCode, 1);
  assert.equal(j.totals.delta, 1277.86);
  assert.equal(j.budget.exceeded, true);
  assert.equal(j.unpriced.length, 2);
  assert.match(j.disclaimer, /not a quote/);
});

test("--region changes the price; unknown region exits 2", async () => {
  const j = JSON.parse((await run(["estimate", "savings.json", "--region", "eu-central-1", "--json"], io)).output);
  assert.equal(j.regionMultiplier, 1.15);
  assert.ok(j.totals.delta < -243.09);
  const bad = await run(["estimate", "savings.json", "--region", "mars-1"], io);
  assert.equal(bad.exitCode, 2);
});

test("errors exit 2: missing file, bad JSON, not a plan, bad --max-delta, unknown subcommand", async () => {
  for (const argv of [
    ["estimate", "missing.json"],
    ["estimate", "bad.json"],
    ["estimate", "np.json"],
    ["estimate", "mixed.json", "--max-delta", "abc"],
    ["estimate", "mixed.json", "--max-delta="],
    ["frobnicate", "mixed.json"],
    ["estimate"],
  ]) {
    assert.equal((await run(argv, io)).exitCode, 2, argv.join(" "));
  }
});

test("a region hint is printed when the plan config names another region", async () => {
  const { output } = await run(["estimate", "mixed.json", "--region", "eu-west-1"], io);
  assert.match(output, /provider config names region us-east-1/);
});

test("real process: exit code 1 over budget, 0 within, 2 on a missing file", () => {
  const cli = new URL("./cli.mjs", import.meta.url).pathname;
  const plan = new URL("./fixtures/plan-mixed.json", import.meta.url).pathname;
  const over = spawnSync("node", [cli, "estimate", plan, "--max-delta", "10"], { encoding: "utf8" });
  assert.equal(over.status, 1);
  assert.match(over.stdout, /BUDGET EXCEEDED/);
  const ok = execFileSync("node", [cli, "estimate", plan, "--max-delta", "99999"], { encoding: "utf8" });
  assert.match(ok, /Budget ok/);
  assert.equal(spawnSync("node", [cli, "estimate", "/nonexistent.json"]).status, 2);
});
