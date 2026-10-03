import test from "node:test";
import assert from "node:assert/strict";
import { run, parseArgs } from "./cli.mjs";

test("default run prints a quote", () => {
  const r = run([]);
  assert.equal(r.code, 0);
  assert.match(r.out, /\*\*Quote: \$/);
});

test("--max-price gate exits 1 when the quote exceeds it", () => {
  assert.equal(run(["--max-price", "100"]).code, 1);
  assert.equal(run(["--max-price", "100000"]).code, 0);
});

test("--ask exits 1 when the per-guest ask loses money", () => {
  assert.equal(run(["--ask", "5"]).code, 1);
  assert.equal(run(["--ask", "500"]).code, 0);
});

test("--compare lists three service models; bad flags throw", () => {
  assert.equal(JSON.parse(run(["--compare", "--guests", "80"]).out).length, 3);
  assert.throws(() => parseArgs(["--nope", "1"]));
  assert.throws(() => parseArgs(["--guests"]));
});
