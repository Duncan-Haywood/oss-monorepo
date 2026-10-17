import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { run } from "./cli.mjs";

const text = readFileSync(new URL("./fixtures/lot.csv", import.meta.url), "utf8");
const io = { readFile: async () => text };

test("split prints list, bulk and comparison sections", async () => {
  const r = await run(["split", "l.csv", "--offer", "260", "--cost", "150"], io);
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /Split the lot: \$325\.03 beats the \$260\.00 offer by \$65\.03/);
  assert.match(r.output, /\+ Cast iron skillets x4/);
  assert.match(r.output, /- Mason jars \(case\) x10/);
  assert.match(r.output, /Profit on a \$150\.00 lot: split \$175\.03, whole \$110\.00/);
});

test("--json parses and the hourly rate changes the answer", async () => {
  const a = JSON.parse((await run(["split", "l", "--json", "--offer", "260", "--rate", "15"], io)).output);
  const b = JSON.parse((await run(["split", "l", "--json", "--offer", "260", "--rate", "60"], io)).output);
  assert.equal(a.best, "split");
  assert.equal(b.best, "whole");
});

test("bad input exits 2", async () => {
  assert.equal((await run(["split", "l", "--bogus"], io)).exitCode, 2);
  assert.equal((await run(["split", "l", "--rate", "abc"], io)).exitCode, 2);
  assert.equal((await run(["split"], io)).exitCode, 2);
  assert.equal((await run(["split", "l"], { readFile: async () => "x,y" })).exitCode, 2);
  assert.equal((await run(["split", "l"], { readFile: async () => { throw new Error("nope"); } })).exitCode, 2);
});
