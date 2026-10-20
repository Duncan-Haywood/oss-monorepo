import test from "node:test";
import assert from "node:assert/strict";
import { main, parseArgs } from "./cli.mjs";
import { parseClaims, analyze, sampleClaims } from "./calc.mjs";

const io = (text) => ({ read: async () => text, stdin: async () => text });

test("the CLI report matches the library on the same claims and fees", async () => {
  const argv = ["claims.csv", "--admin-fee", "115", "--entity-fee", "700"];
  const res = await main(argv, io(sampleClaims()));
  const lib = analyze(parseClaims(sampleClaims()).rows, { adminFee: 115, entityFee: 700 });
  assert.equal(res.code, 0);
  assert.ok(res.out.startsWith(lib.verdict));
  assert.equal((res.out.match(/^FILE /gm) || []).length, lib.filing);
});

test("--json returns the full result and --csv the report CSV", async () => {
  const j = await main(["f", "--json", "--admin-fee", "115", "--entity-fee", "700"], io(sampleClaims()));
  assert.equal(JSON.parse(j.out).lines.length, 6);
  const c = await main(["f", "--csv"], io(sampleClaims()));
  assert.match(c.out, /^Claim,Billed,QPA/);
});

test("--deadlines skips weekends and listed holidays", async () => {
  const plain = await main(["--deadlines", "2026-03-02"]);
  const withHol = await main(["--deadlines", "2026-03-02", "--holidays", "2026-03-16"]);
  assert.match(plain.out, /Open negotiation ends: \d{4}-\d{2}-\d{2}/);
  assert.notEqual(plain.out.split("\n")[0], withHol.out.split("\n")[0]);
  assert.equal((await main(["--deadlines", "nope"])).code, 2);
});

test("bad input exits 2 with a message, never a stack trace", async () => {
  assert.equal(parseArgs(["--bogus"]).error.startsWith("Unknown option"), true);
  assert.equal((await main([])).code, 2);
  assert.equal((await main(["f"], io("nothing here"))).code, 2);
  assert.equal((await main(["f", "--p-qpa", "20", "--p-billed", "50"], io(sampleClaims()))).code, 2);
  assert.equal((await main(["f"], { read: async () => { throw new Error("ENOENT"); } })).code, 2);
});

test("--example needs no file and --help prints usage", async () => {
  assert.equal((await main(["--example"])).code, 0);
  assert.match((await main(["-h"])).out, /Usage:/);
});

test("--outcomes fits the win chances and uses them", async () => {
  const { sampleOutcomes } = await import("./calc.mjs");
  const files = { "c.csv": "ER,3200,980,640\nCT,2850,720,380", "o.csv": sampleOutcomes() };
  const io = { read: async (f) => files[f], stdin: async () => "" };
  const base = await main(["c.csv", "--admin-fee", "100", "--entity-fee", "500", "--json"], io);
  const fitted = await main(["c.csv", "--admin-fee", "100", "--entity-fee", "500", "--outcomes", "o.csv", "--json"], io);
  assert.equal(fitted.code, 0);
  const j = JSON.parse(fitted.out);
  assert.equal(j.fit.n, 12);
  assert.notEqual(j.options.pWinAtQpa, JSON.parse(base.out).options.pWinAtQpa);
  assert.ok(j.warnings.some((w) => /fitted to 12 past dispute/.test(w)));
  const bad = await main(["c.csv", "--outcomes", "missing.csv"], { read: async (f) => { if (!files[f]) throw new Error("nope"); return files[f]; } });
  assert.equal(bad.code, 2);
});
