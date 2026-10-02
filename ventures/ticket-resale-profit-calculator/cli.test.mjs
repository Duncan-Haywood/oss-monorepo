import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { run } from "./cli.mjs";

const sales = readFileSync(new URL("./fixtures/sales.csv", import.meta.url), "utf8");
const files = { readFile: async (p) => { if (p === "sales.csv") return sales; throw new Error("ENOENT"); } };

test("price prints break-even, payout and cross-platform profit", async () => {
  const r = await run(["price", "--cost", "120", "--qty", "2", "--list", "150", "--p-sell", "0.8"]);
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /Break-even list price: \$133\.33/);
  assert.match(r.output, /Ticketmaster resale \$15\.00/);
  assert.match(r.output, /Expected profit at 80% sale chance: -\$24\.00/);
});

test("price --target-profit solves the list price and --json is parseable", async () => {
  const r = await run(["price", "--cost", "120", "--qty", "2", "--target-profit", "100", "--json"]);
  const j = JSON.parse(r.output);
  assert.equal(j.listForTargetProfit, 188.89);
  assert.ok(Math.abs(j.ifSold.profit - 100) < 0.5);
});

test("price rejects missing and invalid input with exit 2", async () => {
  assert.equal((await run(["price", "--list", "10"])).exitCode, 2);
  assert.equal((await run(["price", "--cost", "10", "--fee", "100"])).exitCode, 2);
  assert.equal((await run(["price", "--cost", "x"])).exitCode, 2);
});

test("log reports per-platform results and gates on --min-roi", async () => {
  const r = await run(["log", "sales.csv"], files);
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /StubHub/);
  assert.match(r.output, /Sales that lost money/);
  assert.equal((await run(["log", "sales.csv", "--min-roi", "50"], files)).exitCode, 1);
  assert.equal((await run(["log", "sales.csv", "--min-roi", "5", "--json"], files)).exitCode, 0);
});

test("log reads stdin and fails cleanly on unreadable input", async () => {
  assert.equal((await run(["log", "-"], { stdin: async () => sales })).exitCode, 0);
  assert.equal((await run(["log", "missing.csv"], files)).exitCode, 2);
  assert.equal((await run(["log", "-"], { stdin: async () => "garbage" })).exitCode, 2);
});

test("help, unknown subcommand and unknown option", async () => {
  assert.equal((await run(["--help"])).exitCode, 0);
  assert.equal((await run([])).exitCode, 1);
  assert.equal((await run(["nope"])).exitCode, 2);
  assert.equal((await run(["price", "--wat"])).exitCode, 2);
});
