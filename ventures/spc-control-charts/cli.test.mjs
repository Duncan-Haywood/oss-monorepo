import { test } from "node:test";
import assert from "node:assert/strict";
import { run, parseArgs, HELP } from "./cli.mjs";
import { EXAMPLE_TEXT } from "./example-data.mjs";

test("help cites every paper and lists the rules", () => {
  const { out, code } = run(["--help"]);
  assert.equal(code, 0);
  assert.match(out, /Nelson/);
  assert.match(out, /Shewhart/);
  assert.match(out, /Fifteen points in a row/);
  assert.equal(out, HELP);
});

test("stdin in, words out; exit code 1 when a point signals, 0 when none", () => {
  const sig = run(["-", "--type", "means-imr"], () => EXAMPLE_TEXT);
  assert.equal(sig.code, 1);
  assert.match(sig.out, /Cassette 27 wafer 3/);
  const calm = run(["-"], () => "1\n2\n1\n2\n1\n2");
  assert.equal(calm.code, 0);
  assert.match(calm.out, /No point breaks a rule/);
});

test("json output, rules and spec limits pass through", () => {
  const { out } = run(["-", "--json", "--rules", "1", "--lsl", "1", "--usl", "4"], () => EXAMPLE_TEXT);
  const j = JSON.parse(out);
  assert.ok(j.signals.every((s) => s.rule === 1));
  assert.ok(j.capability.ppk < j.capability.cpk, "between-wafer variation widens the overall spread");
});

test("bad options fail with a message", () => {
  assert.throws(() => parseArgs(["--type", "pie"]), /must be one of/);
  assert.throws(() => parseArgs(["--rules", "9"]), /1 to 8/);
  assert.throws(() => parseArgs(["--lsl"]), /needs a value/);
  assert.throws(() => parseArgs(["--wat"]), /unknown option/);
});
