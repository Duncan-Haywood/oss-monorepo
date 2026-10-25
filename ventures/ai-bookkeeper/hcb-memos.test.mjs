// eval/hcb-memos.mjs on memos written here (the real feed is fetched at run time).
import test from "node:test";
import assert from "node:assert/strict";
import { coverage } from "./eval/hcb-memos.mjs";

test("coverage counts suggested and unmatched memos and keeps the account", () => {
  const c = coverage([
    { memo: "Porkbun", cents: -1000 }, { memo: "Porkbun", cents: -1000 },
    { memo: "2300 Sahara Hotel", cents: -9000 }, { memo: "Zorblax Qux", cents: -500 },
  ]);
  assert.equal(c.n, 4);
  assert.equal(c.suggested, 3);
  assert.equal(c.hits.get("porkbun => 6060"), 2);
  assert.equal(c.hits.get("2300 sahara hotel => 6120"), 1);
  assert.equal(c.misses.get("zorblax qux"), 1);
});
