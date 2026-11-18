// node --test platform/ci/test_copy_drift.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { editDistance, findDrift, tokenDiff } from "./copy_drift.mjs";

const tok = (s) => s.split(" ");
const def = (venture, body, name = "usageAllowed") => ({ name, venture, file: `ventures/${venture}/usage.mjs`, line: 1, tokens: tok(body) });

test("editDistance counts token edits and stops past the cap", () => {
  assert.equal(editDistance(tok("a b c"), tok("a b c")), 0);
  assert.equal(editDistance(tok("a b c"), tok("a x c")), 1);
  assert.equal(editDistance(tok("a b c"), tok("a b c d e")), 2);
  assert.equal(editDistance(tok("a"), tok("a b c d e f"), 2), 3);
});

test("tokenDiff marks the majority's tokens [-x] and the minority's [+x]", () => {
  assert.equal(tokenDiff(tok("return ls . get ( k ) ;"), tok("try { return ls . get ( k ) ; }"), 1), "[+try] [+{] return … ; [+}]");
});

test("findDrift reports a minority copy a few tokens from the majority", () => {
  const plain = "return ls . getItem ( K ) !== 'true' ;";
  const guarded = "try { return ls . getItem ( K ) !== 'true' ; } catch { return false ; }";
  const defs = ["a", "b", "c", "d", "e", "f"].map((v) => def(v, plain)).concat([def("g", guarded)]);
  const out = findDrift(defs, { minVentures: 4, maxDist: 12 });
  assert.equal(out.length, 1);
  assert.equal(out[0].majorCount, 6);
  assert.deepEqual(out[0].minor, ["ventures/g/usage.mjs:1"]);
  assert.match(out[0].diff, /\[\+try\]/);
});

test("findDrift ignores two real variants, far-off bodies and rare names", () => {
  const x = "return a + b ;";
  const y = "return a - b ;";
  // 3 vs 3: two variants, neither is drift
  assert.equal(findDrift(["a", "b", "c"].map((v) => def(v, x)).concat(["d", "e", "f"].map((v) => def(v, y)))).length, 0);
  // far-off body with the same name
  const far = Array.from({ length: 40 }, (_, i) => `t${i}`).join(" ");
  assert.equal(findDrift(["a", "b", "c", "d"].map((v) => def(v, x)).concat([def("e", far)]), { maxDist: 12 }).length, 0);
  // a name in fewer ventures than minVentures
  assert.equal(findDrift([def("a", x), def("b", x), def("c", y)], { minVentures: 4 }).length, 0);
});
