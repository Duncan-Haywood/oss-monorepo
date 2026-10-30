import test from "node:test";
import assert from "node:assert/strict";
import { score } from "./eval/bounces.mjs";

test("real delivery-failure messages: no hard bounce is read as anything else", () => {
  const s = score();
  assert.equal(s.n, 117);
  assert.deepEqual(s.missedBounces.map((m) => m.file), []);
  // One known miss: microsoft_03, a list-moderation hold worded "could not be delivered", reads as a bounce.
  assert.ok(s.right >= 116);
});
